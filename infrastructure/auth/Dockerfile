FROM quay.io/keycloak/keycloak:26.4.6

# Configure the build for Postgres
ENV KC_DB=postgres

# Run the build step to create an optimized image
RUN /opt/keycloak/bin/kc.sh build