/**
 * UUID Validation Middleware
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validateUUID =
  (paramName = "id") =>
  (req, res, next) => {
    const value = req.params[paramName];
    if (value && !UUID_REGEX.test(value)) {
      return res
        .status(400)
        .json({ success: false, message: `Invalid ${paramName} format` });
    }
    next();
  };

export default { validateUUID };
