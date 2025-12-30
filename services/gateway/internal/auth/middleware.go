package auth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
)

type UserContextKey string

const userContextKey UserContextKey = "user_id"

// Authenticator holds the OIDC verification logic
type Authenticator struct {
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
}

// NewAuthenticator initializes the connection to Keycloak.
// Call this ONCE in main.go
func NewAuthenticator(ctx context.Context, issuerURL, clientID string) (*Authenticator, error) {
	// 1. Discovery: Hits {issuer}/.well-known/openid-configuration
	provider, err := oidc.NewProvider(ctx, issuerURL)
	if err != nil {
		return nil, err
	}

	// 2. Config: We want to check that the token is for OUR Client ID
	config := &oidc.Config{
		ClientID: clientID,
		// SkipClientIDCheck: true, // Uncomment if you accept tokens issued for other clients (frontend)
	}

	return &Authenticator{
		provider: provider,
		verifier: provider.Verifier(config),
	}, nil
}

// Middleware is the standard Go/Chi middleware function
func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Extract Header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing Authorization header", http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Invalid header format", http.StatusUnauthorized)
			return
		}

		rawToken := parts[1]

		// 2. Verify Token (Signature, Exp, Aud)
		// This uses cached keys from Keycloak
		idToken, err := a.verifier.Verify(r.Context(), rawToken)
		if err != nil {
			slog.Warn("Token verification failed", "error", err)
			// This covers expired tokens, bad signatures, wrong issuer
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		// 3. Extract Custom Claims (Roles, Email)
		var claims KeycloakClaims
		if err := idToken.Claims(&claims); err != nil {
			http.Error(w, "Failed to parse claims", http.StatusInternalServerError)
			return
		}

		// 4. Construct Clean UserInfo
		userInfo := UserInfo{
			ID:              claims.Subject, // This is the stable UUID
			Username:        claims.PreferredUsername,
			Email:           claims.Email,
			Roles:           claims.RealmAccess.Roles,
			AuthorizedParty: claims.Azp,
		}

		// 5. Inject into Context
		ctx := context.WithValue(r.Context(), userContextKey, userInfo)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// --- Helper Functions for Handlers ---

// GetUserInfo retrieves the user data from context
func GetUserInfo(ctx context.Context) (UserInfo, error) {
	val := ctx.Value(userContextKey)
	if user, ok := val.(UserInfo); ok {
		return user, nil
	}
	return UserInfo{}, errors.New("no user found in context")
}

// GetUserID is a shortcut for just the UUID
func GetUserID(ctx context.Context) (string, error) {
	user, err := GetUserInfo(ctx)
	if err != nil {
		return "", err
	}
	return user.ID, nil
}

// HasRole checks if the user has a specific Keycloak Realm Role
func HasRole(ctx context.Context, role string) bool {
	user, err := GetUserInfo(ctx)
	if err != nil {
		return false
	}
	for _, r := range user.Roles {
		if r == role {
			return true
		}
	}
	return false
}
