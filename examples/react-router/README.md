# React Router with NexusDI Example

A modern, production-ready template for building full-stack React applications using React Router with NexusDI dependency injection.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 🏗️ NexusDI dependency injection
- 📖 [React Router docs](https://reactrouter.com/)

## NexusDI Integration

This example demonstrates how to use NexusDI with React Router 7 in a modular SSR application:

### Architecture

```
app/
├── modules/
│   ├── users/                    # Users feature module
│   │   ├── user.service.ts       # User service with DI
│   │   ├── users.module.ts       # Users module registration
│   │   └── users.route.tsx       # Route using DI
│   └── logger/                   # Logger feature module
│       ├── logger.service.ts     # Logger service with DI
│       ├── logger.module.ts      # Logger module registration
│       └── logger.middleware.ts  # Middleware using DI
├── shared/
│   └── container.ts              # Container management
├── root.tsx                      # Middleware orchestration
└── routes.ts                     # Route registration
```

### Key Features

- **Modular DI**: Each feature has its own module with services
- **SSR Integration**: DI container used in loaders and actions
- **Middleware Support**: Middleware can consume services from container
- **Type Safety**: Full TypeScript support with proper typing

### Dependencies

The following dependencies are required for NexusDI to work:

```json
{
  "dependencies": {
    "reflect-metadata": "^0.2.1"
  }
}
```

### TypeScript Configuration

The following TypeScript options are required:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### Usage

1. **Define Services**: Create services with `@Service()` decorator
2. **Create Modules**: Register services in modules with `@Module()`
3. **Use in Routes**: Inject services in loaders and actions via context
4. **Add Middleware**: Create middleware that consumes services

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

To keep the component code clean and readable, this example uses [`class-variance-authority`](https://cva.style/docs) to organize Tailwind classes into variants. You can find the style definitions in `app/routes/home.variants.ts`.

---

Built with ❤️ using React Router and NexusDI.
