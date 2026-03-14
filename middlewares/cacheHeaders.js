/**
 * Production Cache Headers Middleware
 */

export const cacheList =
  (seconds = 60) =>
  (req, res, next) => {
    if (req.method === "GET") {
      res.set(
        "Cache-Control",
        `public, max-age=${seconds}, s-maxage=${seconds * 2}`,
      );
      res.set("Vary", "Accept-Encoding");
    }
    next();
  };

export const cacheDetail =
  (seconds = 300) =>
  (req, res, next) => {
    if (req.method === "GET") {
      res.set(
        "Cache-Control",
        `public, max-age=${seconds}, s-maxage=${seconds * 2}`,
      );
      res.set("Vary", "Accept-Encoding");
    }
    next();
  };

export const noCache = (req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
};

export default { cacheList, cacheDetail, noCache };
