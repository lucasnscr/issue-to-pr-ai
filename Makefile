.PHONY: setup doctor verify acceptance test unit check up down run

setup:
	node scripts/install-git-hooks.mjs
	python3 -m venv .venv
	.venv/bin/pip install --disable-pip-version-check -r requirements-dev.txt

doctor:
	node scripts/repository-doctor.mjs --offline

verify: check test

acceptance:
	node scripts/smoke.mjs
	node scripts/category-acceptance.mjs
	node scripts/price-acceptance.mjs
	node scripts/ordering-acceptance.mjs

test:
	./mvnw -B -ntp verify

unit:
	./mvnw -B -ntp test

check:
	node --test scripts/tests/*.test.cjs scripts/check-staged-file-size.test.mjs
	node scripts/validate-skills.cjs
	node scripts/validate-docs.mjs
	node scripts/repository-doctor.mjs --offline
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
