import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.smeeware.com",
        port: "",
        pathname: "/**",
        // search bleibt offen: Ein leerer Wert wuerde jede URL mit
        // Query-String mit 400 abweisen, also auch Cache-Buster.
      },
    ],
  },
};

export default nextConfig;
