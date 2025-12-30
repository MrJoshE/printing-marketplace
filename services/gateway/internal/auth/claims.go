package auth

import "github.com/golang-jwt/jwt/v5"

// KeycloakClaims extracts the specific data we need from the JWT
type KeycloakClaims struct {
	// Standard OIDC claims (sub, exp, iat, etc.)
	jwt.RegisteredClaims

	// Custom Keycloak fields
	Email             string `json:"email"`
	EmailVerified     bool   `json:"email_verified"`
	PreferredUsername string `json:"preferred_username"`
	Azp               string `json:"azp"`
	RealmAccess       struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
}

// UserInfo is the clean struct we will put into the Context
type UserInfo struct {
	ID              string // The 'sub' field (UUID)
	Username        string
	Email           string
	AuthorizedParty string
	Roles           []string
}
