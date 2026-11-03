IMAGE ?= teamspeak-frontend:local
CONTAINER ?= teamspeak-frontend-local
PORT ?= 8080
VITE_API_URL ?= http://localhost:10000
VITE_REALTIME_URL ?= http://localhost:10001

.PHONY: install dev validate test build docker-build docker-run docker-stop clean

install:
	npm ci

dev:
	npm run dev

validate:
	npm run validate

test:
	npm run test:coverage

build:
	npm run build

docker-build:
	docker build \
		--build-arg VITE_API_URL=$(VITE_API_URL) \
		--build-arg VITE_REALTIME_URL=$(VITE_REALTIME_URL) \
		--tag $(IMAGE) .

docker-run: docker-build
	docker run --detach --rm \
		--name $(CONTAINER) \
		--publish $(PORT):80 \
		$(IMAGE)

docker-stop:
	docker stop $(CONTAINER)

clean:
	rm -rf dist coverage
