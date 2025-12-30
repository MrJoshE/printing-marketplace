
NETWORK=printing_service

setup:
	# Ensure the Docker network 'printing_service' exists
	@docker network inspect $(NETWORK) >/dev/null 2>&1 || \
		docker network create --driver bridge $(NETWORK)

	@echo "Docker network '$(NETWORK)' is set up."
	@docker compose -f docker-compose.yml up -d

teardown:
	@docker compose -f docker-compose.yml down --rmi local