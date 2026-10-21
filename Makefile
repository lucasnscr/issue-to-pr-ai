.PHONY: test unit check up down run

test:
	./mvnw -B -ntp verify

unit:
	./mvnw -B -ntp test

check:
	node --test scripts/tests/*.test.cjs
	.venv/bin/python scripts/validate_config.py
	docker compose config --quiet
	kubectl kustomize infra/kubernetes/application > /dev/null
	kubectl kustomize infra/kubernetes/inference > /dev/null

up:
	docker compose up --build -d

down:
	docker compose down

run:
	./mvnw -pl apps/catalog-api spring-boot:run
