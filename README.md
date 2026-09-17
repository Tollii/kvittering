# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
bun x sv@0.17.0 create --template minimal --types ts --add prettier eslint playwright better-auth="demo:password" ai-tools="ide:other" experimental="versions:kit+features:async,remoteFunctions,explicitEnvironmentVariables,handleRenderingErrors" drizzle="database:sqlite+sqlite:libsql" --install bun sveltemo
```

## Developing

Install dependencies with `bun install`. The home page subscribes to the public
`samples:list` query through `convex-svelte`. It displays loading, error, empty,
and data states. Sample data is stored in Convex, not in the page.

Run the Convex development server in one terminal:

```sh
bunx convex dev
```

Use the development deployment configured in `.env.local`. Set
`PUBLIC_CONVEX_URL` to that deployment's URL. This variable is declared in
`src/env.ts` and included in the client at build time.

Add the three sample records, then start Svelte in another terminal:

```sh
bunx convex run samples:seed
bun run dev -- --open
```

The seed function is internal. Repeated calls do not duplicate or overwrite
records. The public query returns at most 20 records in name order. To check
live updates, edit a sample description in the Convex development dashboard;
the open page updates without a reload.

For a single backend update and seed operation, use
`bunx convex dev --once --run samples:seed`.

Validate the app with `bun run check`, `bunx tsc --noEmit -p convex/tsconfig.json`,
and `bun run build`.

The separate Better Auth demo uses Drizzle. Its schema is generated with
`bun run auth:schema`; apply it to the configured database with `bun run db:push`
before using the authentication demo.

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
