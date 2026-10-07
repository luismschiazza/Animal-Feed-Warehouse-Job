# Agora API

## Overview

Agora API is a scalable backend service built with **NestJS**, designed to support modern application ecosystems.
It provides a solid architectural foundation including user authentication, email sending, code generation tooling, and MongoDB integration.
The project prioritizes clean structure, reliable development workflows, and full Docker support.


---

## Requirements

To run this project, ensure your machine has the following:

- [Node.js (24.x LTS)](https://nodejs.org/)
- [npm (>=11.3)](https://www.npmjs.com/)
- [Docker Engine (>= 20.x)](https://www.docker.com/)
- [Docker Compose Plugin (>= 2.x)](https://docs.docker.com/compose/)
- [nvm installed](https://github.com/nvm-sh/nvm) 

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/luismschiazza/agora-api.git
cd agora-api
```

### 2. Load the Recommended Node Version

```bash
nvm install
nvm use
```

### 3. Environment Variables

Copy the example configuration file:

```bash
cp .env.example .env
```

After creating the `.env` file, run the command `npm run cli -- generate:jwt-secret` to automatically generate and populate the `JWT_SECRET` value in your `.env` file.

Then update `.env` with your environment values, such as:

- Application host and ports
- MongoDB connection URL
- JWT secrets and expiration settings

### 4. Install Dependencies

Using npm:

```bash
npm install
```

---

## Running the Project

You may run the project using Docker or run MongoDB in Docker and NestJS locally.

---

## Running with Docker

### Start Only MongoDB (Recommended for Development)

```bash
docker compose up -d mongo-db
```

Then start NestJS locally with hot reload:

```bash
npm run start:dev
```

### Run Everything in Docker

If you prefer both MongoDB and the API inside Docker containers:

```bash
docker compose up -d
```

> Note: If your Docker installation does not support `docker compose`, use `docker-compose` instead.

---

## Running without Docker

If you prefer local execution without containers:

### Start MongoDB Locally

```bash
mongod
```

### Run the NestJS Application

```bash
npm run start:dev
```

---

## Available Commands

The project includes several useful development scripts defined in `package.json`.

### General Commands

- **`npm run build`**
  Compiles TypeScript into JavaScript in the `dist` folder.

- **`npm start`**
  Runs the compiled application in production mode.

- **`npm run start:dev`**
  Runs the application with hot reload enabled.
  Recommended for development.

- **`npm run start:prod`**
  Runs the application in production mode.

- **`npm test`**
  Executes unit tests using Jest.

- **`npm run format`**
  Formats source code using Prettier.

- **`npm run lint`**
  Lints the codebase using ESLint and automatically fixes issues.

### Console Commands

- **`npm run cli -- seed`**
  Seeds the database with demo data.

- **`npm run cli -- generate:jwt-secret`**
  Generates a secure JWT secret and updates the .env file.

---

## Docker Reference Commands

Below are useful Docker commands for local development:

- Start services
  ```bash
  docker compose up -d
  ```

- Stop all running containers
  ```bash
  docker stop $(docker ps -q)
  ```

- Remove all containers
  ```bash
  docker rm $(docker ps -a -q)
  ```

- Remove all images
  ```bash
  docker rmi $(docker images -q)
  ```

- Clean unused resources
  ```bash
  docker system prune -a --volumes
  ```

- View container logs
  ```bash
  docker logs <container_id>
  ```

- Build an image
  ```bash
  docker build -t <image_name> .
  ```

- Run a container
  ```bash
  docker run -d -p <host_port>:<container_port> <image_name>
  ```

---

## API Documentation

The project now includes full Swagger documentation available at `/api/docs`.  
You can also import this API specification directly into Postman:

### Importing Swagger into Postman
1. Start the application (`npm run start:dev`).
2. Open your browser at: `http://localhost:3000/api/docs-json`
3. Copy the full JSON returned by the endpoint.
4. In Postman, click **Import**.
5. Select **Link** or **Raw Text** and paste the JSON.
6. Postman will automatically generate a full collection with all endpoints, payload examples, and authentication requirements.

### Why Use Swagger + Postman?
- Ensures your API documentation always stays up to date.
- Works as a single source of truth for backend and frontend teams.
- Allows you to share a ready‑to‑use Postman collection with your team or client.

More documentation can be added in the future such as:
- Contribution guidelines
- Production deployment instructions
- Versioning and release workflow

---

## Conclusion

This README provides a clean and complete guide for setting up and running the Agora API.
It includes installation steps, environment setup, Docker instructions, and available development commands.

If you need additional sections such as Swagger documentation, deployment guides, or contribution guidelines, feel free to request them.
