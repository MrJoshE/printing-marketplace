import Keycloak from "keycloak-js";
import { MARKETPLACE_CONFIG } from "../utils";

const keycloakConfig = {
  url: MARKETPLACE_CONFIG.authorization.url,
  realm: MARKETPLACE_CONFIG.authorization.realm,
  clientId: MARKETPLACE_CONFIG.authorization.clientId,
};

const keycloak = new Keycloak(keycloakConfig);

export default keycloak;