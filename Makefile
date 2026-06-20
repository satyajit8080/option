.PHONY: help install backend frontend redis test build clean

help:
	@echo "Targets:"
	@echo "  make install    - install backend + frontend deps"
	@echo "  make redis      - start a local redis (docker)"
	@echo "  make backend    - run FastAPI dev server on :8000"
	@echo "  make frontend   - run Vite dev server on :5173"
	@echo "  make test       - run backend pytest suite"
	@echo "  make build      - production build of the frontend"
	@echo "  make clean      - remove build artifacts & caches"

install:
	cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
	cd frontend && npm install

redis:
	docker run --rm -p 6379:6379 redis:7-alpine

backend:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && . .venv/bin/activate && pytest -v

build:
	cd frontend && npm run build

clean:
	rm -rf frontend/node_modules frontend/dist
	find . -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find . -name '*.pyc' -delete 2>/dev/null || true
