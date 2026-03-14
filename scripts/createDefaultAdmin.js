#!/usr/bin/env node
/**
 * Create or re-activate the default admin user.
 * Usage: node scripts/createDefaultAdmin.js
 */
import "dotenv/config";
import { sequelize, AdminUser } from "../models/postgres/index.js";
import { hashPassword } from "../utils/hash.js";

const USERNAME = "admin";
const PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "12345678";
const EMAIL = "admin@venicewood.com";

async function run() {
  await sequelize.sync();

  let user = await AdminUser.findOne({ where: { username: USERNAME } });
  if (!user) {
    const hashed = await hashPassword(PASSWORD);
    user = await AdminUser.create({
      name: "Default Admin",
      username: USERNAME,
      email: EMAIL,
      password: hashed,
      role: "admin",
      permissions: ["products", "projects", "blogs"],
      isActive: true,
    });
    console.log("Default admin created:", USERNAME);
  } else {
    user.isActive = true;
    user.password = await hashPassword(PASSWORD);
    user.role = "admin";
    user.permissions = ["products", "projects", "blogs"];
    await user.save();
    console.log("Default admin updated and activated:", USERNAME);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Error creating admin:", err.message);
  process.exit(1);
});
