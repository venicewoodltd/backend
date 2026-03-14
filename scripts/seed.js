#!/usr/bin/env node
/**
 * Seed script — creates demo data for development.
 * Usage: node scripts/seed.js
 */
import "dotenv/config";
import {
  sequelize,
  Product,
  Project,
  Blog,
  Category,
  Testimonial,
  AdminUser,
} from "../models/postgres/index.js";
import { hashPassword } from "../utils/hash.js";
import { slugify } from "../utils/slugify.js";

async function seed() {
  await sequelize.sync();
  console.log("Database synced");

  // Admin user
  let admin = await AdminUser.findOne({ where: { username: "admin" } });
  if (!admin) {
    admin = await AdminUser.create({
      name: "Default Admin",
      username: "admin",
      email: "admin@venicewood.com",
      password: await hashPassword("12345678"),
      role: "admin",
      permissions: ["products", "projects", "blogs"],
      isActive: true,
    });
    console.log("Admin user created");
  }

  // Categories
  const cats = [
    { name: "Furniture", slug: "furniture", type: "product" },
    { name: "Architectural", slug: "architectural", type: "project" },
    { name: "Techniques", slug: "techniques", type: "blog" },
  ];
  for (const cat of cats) {
    await Category.findOrCreate({
      where: { slug: cat.slug, type: cat.type },
      defaults: cat,
    });
  }
  console.log("Categories seeded");

  // Products
  const products = [
    {
      name: "Handcrafted Oak Table",
      description: "A beautifully handcrafted solid oak dining table.",
      category: "Furniture",
      wood_type: "Oak",
      status: "published",
    },
    {
      name: "Walnut Bookshelf",
      description: "Elegant walnut bookshelf with adjustable shelves.",
      category: "Furniture",
      wood_type: "Walnut",
      status: "published",
    },
    {
      name: "Teak Garden Bench",
      description: "Weather-resistant teak bench for outdoor spaces.",
      category: "Furniture",
      wood_type: "Teak",
      status: "published",
      featured: true,
    },
  ];
  for (const p of products) {
    const slug = slugify(p.name);
    await Product.findOrCreate({
      where: { slug },
      defaults: { ...p, slug, createdBy: admin.id },
    });
  }
  console.log("Products seeded");

  // Projects
  const projects = [
    {
      name: "Custom Wine Cellar",
      title: "Custom Wine Cellar",
      description: "Full wine cellar fit-out in mahogany.",
      category: "architectural",
      status: "published",
      featured: true,
    },
    {
      name: "Heritage Staircase Restoration",
      title: "Heritage Staircase Restoration",
      description: "Period-accurate staircase restoration.",
      category: "architectural",
      status: "published",
    },
  ];
  for (const p of projects) {
    const slug = slugify(p.name);
    await Project.findOrCreate({
      where: { slug },
      defaults: { ...p, slug, createdBy: admin.id },
    });
  }
  console.log("Projects seeded");

  // Blogs
  const blogs = [
    {
      title: "Choosing the Right Wood",
      content: "A guide to selecting wood for your project.",
      excerpt: "Learn about different wood types.",
      category: "Techniques",
      status: "published",
    },
  ];
  for (const b of blogs) {
    const slug = slugify(b.title);
    await Blog.findOrCreate({
      where: { slug },
      defaults: { ...b, slug, createdBy: admin.id },
    });
  }
  console.log("Blogs seeded");

  // Testimonials
  const testimonials = [
    {
      author: "John D.",
      content: "Exceptional craftsmanship and attention to detail.",
      rating: 5,
      featured: true,
    },
    {
      author: "Sarah M.",
      content: "Our custom dining table is absolutely stunning.",
      rating: 5,
      featured: true,
    },
  ];
  for (const t of testimonials) {
    await Testimonial.findOrCreate({
      where: { author: t.author },
      defaults: t,
    });
  }
  console.log("Testimonials seeded");

  console.log("Seed complete");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err.message);
  process.exit(1);
});
