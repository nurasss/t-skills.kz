const config = process.env.ORBITA_DEPLOY_TARGET === "vercel"
  ? { plugins: {} }
  : {
      plugins: {
        "@tailwindcss/postcss": {},
      },
    };

export default config;
