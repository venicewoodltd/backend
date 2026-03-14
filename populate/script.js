#!/usr/bin/env node
/**
 * Database Populate Script
 * Creates 20 products, 20 projects, 20 blogs, 20 testimonials,
 * and 10 categories per type with images uploaded to GridFS.
 *
 * Usage: node populate/script.js
 */

// Load .env BEFORE any app modules (ESM hoists static imports, so we use dynamic imports)
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Now dynamically import app modules (env vars are set)
const { default: mongoose } = await import("mongoose");
const { sequelize, Product, Project, Blog, Testimonial, Category, AdminUser } =
  await import("../models/postgres/index.js");
const { default: Media } = await import("../models/mongodb/Media.js");
const { connectMongoDB } = await import("../config/database.js");
const { slugify } = await import("../utils/slugify.js");

// Use mongoose's bundled mongodb driver to avoid BSON version mismatch
const { GridFSBucket } = mongoose.mongo;

const ASSETS_DIR = path.join(__dirname, "assets");

// ─── Helpers ──────────────────────────────────────────────
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let imageFiles;
function loadImages() {
  imageFiles = fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  if (!imageFiles.length) throw new Error("No images found in assets folder");
  console.log(`Found ${imageFiles.length} images in assets`);
}

async function uploadImage(bucket, imageName) {
  const filePath = path.join(ASSETS_DIR, imageName);
  const buffer = fs.readFileSync(filePath);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${imageName}`;
  const contentType = imageName.endsWith(".png") ? "image/png" : "image/jpeg";

  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream(filename, {
      contentType,
      metadata: { contentType },
    });
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve({ _id: stream.id, filename, contentType, length: buffer.length });
    };
    stream.on("finish", done);
    stream.on("close", done);
    stream.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
    stream.end(buffer);
  });
}

// ─── Categories ───────────────────────────────────────────
const productCategoryNames = [
  "Custom Furniture",
  "Doors & Entrances",
  "Kitchen & Cabinetry",
  "Bedroom Collections",
  "Outdoor Living",
  "Staircases & Railings",
  "Flooring & Decking",
  "Wall Panelling",
  "Wardrobes & Storage",
  "Restoration & Antique",
];

const projectCategoryNames = [
  "Residential Interiors",
  "Commercial Fit-outs",
  "Heritage Restoration",
  "Landscape & Garden",
  "Luxury Villas",
  "Boutique Hotels",
  "Office Spaces",
  "Retail Design",
  "Marine & Yacht",
  "Architectural Features",
];

const blogCategoryNames = [
  "Woodworking Techniques",
  "Design Inspiration",
  "Material Guides",
  "Project Showcases",
  "Sustainability",
  "Tools & Equipment",
  "Industry Trends",
  "Behind the Scenes",
  "Client Stories",
  "Expert Tips",
];

const categoryColors = [
  "#4e342e",
  "#6d4c41",
  "#795548",
  "#8d6e63",
  "#a1887f",
  "#3e2723",
  "#5d4037",
  "#4e342e",
  "#bcaaa4",
  "#d7ccc8",
];

// ─── Product Data ─────────────────────────────────────────
const woodTypes = [
  "Oak",
  "Walnut",
  "Teak",
  "Mahogany",
  "Cherry",
  "Maple",
  "Ash",
  "Cedar",
  "Elm",
  "Beech",
];
const materials = [
  "Solid Hardwood",
  "Engineered Wood",
  "Reclaimed Timber",
  "Exotic Hardwood",
  "Sustainable Bamboo",
];
const finishes = [
  "Hand-rubbed Oil",
  "Danish Oil",
  "Lacquer",
  "Wax Polish",
  "Natural Matte",
  "Satin Varnish",
  "French Polish",
];
const joineryTypes = [
  "Mortise & Tenon",
  "Dovetail",
  "Finger Joint",
  "Biscuit Joint",
  "Dowel Joint",
  "Japanese Joinery",
];
const deliveryOptions = [
  "4-6 weeks",
  "6-8 weeks",
  "8-12 weeks",
  "3-4 months",
  "By consultation",
];

const productNames = [
  "Handcrafted Oak Dining Table",
  "Walnut Executive Desk",
  "Teak Garden Lounge Set",
  "Mahogany Four-Poster Bed",
  "Cherry Wood Bookshelf",
  "Maple Kitchen Island",
  "Ash Wood Console Table",
  "Cedar Outdoor Pergola",
  "Elm Farmhouse Bench",
  "Beech Wood Sideboard",
  "Reclaimed Oak Coffee Table",
  "Walnut Floating Shelves",
  "Teak Bathroom Vanity",
  "Mahogany Wine Cabinet",
  "Cherry Wood Rocking Chair",
  "Maple Veneer Wardrobe",
  "Ash Wood Bar Counter",
  "Cedar Storage Chest",
  "Elm Wood Nightstand",
  "Beech Dining Chair Set",
];

const productDescriptions = [
  "Meticulously handcrafted from premium timber, this piece embodies the finest traditions of European woodworking with a contemporary Mauritian touch.",
  "A stunning centrepiece designed for modern living spaces, combining clean lines with the natural warmth of solid hardwood.",
  "Built to last generations, this timeless piece showcases exceptional joinery and hand-selected grain patterns.",
  "Expertly crafted using traditional techniques passed down through generations of master woodworkers.",
  "This bespoke creation brings nature indoors with its organic form and exquisite wood grain detailing.",
];

const productLongDescriptions = [
  "Every detail of this piece has been carefully considered, from the selection of the finest kiln-dried timber to the final hand-rubbed finish. Our master craftsmen spend over 100 hours bringing this design to life, ensuring every joint is precise and every surface is flawless. The natural grain patterns make each piece truly unique — no two are ever identical.\n\nDesigned for both beauty and functionality, this piece features hidden storage compartments and soft-close mechanisms. The wood has been treated with our proprietary finishing process that enhances the natural colour while providing lasting protection against moisture and wear.",
  "Crafted in our Mauritius workshop using sustainably sourced hardwood, this piece represents the pinnacle of bespoke woodworking. The design draws inspiration from both tropical aesthetics and classic European craftsmanship, resulting in a harmonious blend that suits any interior style.\n\nEach component is hand-fitted using traditional joinery methods — no nails or screws mar the clean lines. The finish develops a rich patina over time, growing more beautiful with each passing year.",
  "This masterwork combines form and function in perfect harmony. The carefully selected timber has been air-dried for over two years before entering our workshop, ensuring stability and longevity. Our artisans have shaped every curve and chamfer by hand, creating a piece that is as beautiful to touch as it is to behold.\n\nThe construction uses time-honored techniques that have proven their worth over centuries, adapted with modern precision tools for impeccable accuracy.",
];

// ─── Project Data ─────────────────────────────────────────
const projectNames = [
  "Luxury Villa Interior Fit-out",
  "Heritage Hotel Lobby Restoration",
  "Modern Beach House Decking",
  "Executive Office Suite",
  "Boutique Restaurant Design",
  "Tropical Garden Pavilion",
  "Penthouse Library Installation",
  "Yacht Interior Woodwork",
  "Wine Cellar Construction",
  "Colonial Estate Renovation",
  "Spa & Wellness Centre",
  "Art Gallery Display Systems",
  "Private Chapel Restoration",
  "Seaside Villa Balcony",
  "Mountain Lodge Interiors",
  "Retail Showroom Fit-out",
  "Rooftop Terrace Deck",
  "Historic Manor Staircase",
  "Beachfront Bar & Restaurant",
  "Residential Kitchen Remodel",
];

const clients = [
  "The Ravensworth Estate",
  "Hôtel Le Paradis",
  "Coastal Living Properties",
  "Meridian Corporate",
  "La Belle Cuisine Restaurant",
  "Tropical Retreats Ltd",
  "Private Client",
  "Azure Yachts International",
  "Domaine des Vignes",
  "Heritage Mauritius Trust",
  "Serenity Spa Group",
  "Galleria d'Arte",
  "St. James Parish",
  "Villa Bleu Lagon",
  "Montagne Blanche Lodge",
  "Prestige Retail Group",
  "Sky Garden Residences",
  "Château de Belle Mare",
  "Plage Dorée Hospitality",
  "The Anderson Family",
];

const locations = [
  "Grand Baie, Mauritius",
  "Port Louis, Mauritius",
  "Flic-en-Flac, Mauritius",
  "Bel Ombre, Mauritius",
  "Tamarin, Mauritius",
  "Rivière Noire, Mauritius",
  "Curepipe, Mauritius",
  "Pereybère, Mauritius",
  "Le Morne, Mauritius",
  "Trou aux Biches, Mauritius",
  "Pointe aux Canonniers, Mauritius",
  "Mahébourg, Mauritius",
  "Quatre Bornes, Mauritius",
  "Rose Hill, Mauritius",
  "Albion, Mauritius",
  "Calodyne, Mauritius",
  "Belle Mare, Mauritius",
  "Pamplemousses, Mauritius",
  "Cap Malheureux, Mauritius",
  "Goodlands, Mauritius",
];

const techniques = [
  "Hand-cut Dovetails",
  "Steam Bending",
  "Marquetry",
  "Wood Turning",
  "Hand Carving",
  "Veneering",
  "French Polishing",
  "Pyrography",
  "Inlay Work",
  "Fretwork",
  "Lamination",
  "Spalting Treatment",
];

// ─── Blog Data ────────────────────────────────────────────
const blogTitles = [
  "The Art of Selecting Premium Hardwoods for Bespoke Furniture",
  "Understanding Wood Grain: A Comprehensive Guide",
  "5 Traditional Joinery Techniques Every Woodworker Should Know",
  "Sustainable Forestry and the Future of Fine Woodworking",
  "How to Care for Your Solid Wood Furniture",
  "The History of Woodworking in Mauritius",
  "Designing Custom Kitchens: From Concept to Completion",
  "Steam Bending: Shaping Wood Beyond Straight Lines",
  "Choosing the Right Finish for Your Wooden Floors",
  "Behind the Scenes: A Day in Our Workshop",
  "The Timeless Appeal of Handcrafted Wooden Doors",
  "Modern Minimalism Meets Traditional Woodcraft",
  "Outdoor Wood Furniture: Selecting Weather-Resistant Species",
  "Restoration vs. Reproduction: Preserving Heritage Woodwork",
  "The Science of Wood Drying and Seasoning",
  "Creating Statement Staircases with Exotic Timbers",
  "Wood and Wellness: Biophilic Design in Modern Interiors",
  "The Craft of Hand-Cut Dovetail Joints",
  "From Tree to Table: Our Supply Chain Story",
  "Japanese Woodworking Techniques in Contemporary Design",
];

const blogExcerpts = [
  "Discover the secrets behind selecting the perfect timber for your next bespoke furniture project, from grain patterns to moisture content.",
  "Wood grain tells a story. Learn how to read it, work with it, and make it the star of your woodworking projects.",
  "Master the fundamental joinery techniques that form the backbone of quality furniture construction.",
  "How sustainable forestry practices are shaping the future of premium woodworking materials.",
  "Essential tips for maintaining the beauty and longevity of your handcrafted wooden furniture pieces.",
  "Explore the rich woodworking heritage of Mauritius, from colonial-era craftsmanship to modern bespoke design.",
  "A step-by-step look at our custom kitchen design process, from initial consultation to final installation.",
  "Learn the ancient art of steam bending and how we use it to create flowing curves in solid timber.",
  "A comprehensive comparison of wood finishes to help you choose the perfect protection for your floors.",
  "Take a virtual tour of our Mauritius workshop and see how our master craftsmen create remarkable pieces.",
];

function generateBlogContent(title) {
  return `<h2>Introduction</h2>
<p>${title} is a fascinating subject that lies at the heart of what we do at Venice Wood Ltd. For over two decades, our team of master craftsmen has refined their skills in this area, combining traditional Mauritian woodworking heritage with modern techniques and sensibilities.</p>

<p>In this comprehensive guide, we explore every facet of this topic, drawing on our extensive experience working with clients across Mauritius and beyond. Whether you are a homeowner planning a renovation, an architect spec'ing materials, or simply a lover of fine woodwork, you will find valuable insights here.</p>

<h2>The Fundamentals</h2>
<p>At its core, quality woodworking begins with understanding the material. Each species of timber has its own character — its grain, its colour, its workability, and its structural properties. Our workshop in Bel Air Rivière Sèche houses a carefully curated selection of both local and imported hardwoods, each chosen for its unique qualities.</p>

<p>We source our timber from certified sustainable forests, ensuring that every piece we create contributes to a responsible supply chain. This commitment to sustainability does not compromise quality — in fact, well-managed forests produce superior timber with more consistent grain patterns and fewer defects.</p>

<h2>Our Approach</h2>
<p>Every project at Venice Wood Ltd begins with a detailed consultation. We take the time to understand your vision, your space, and your lifestyle. This collaborative approach ensures that the final piece is not just beautiful, but perfectly suited to its intended purpose and environment.</p>

<p>Our craftsmen then translate this vision into reality using a blend of hand tools and precision machinery. While we embrace technology where it enhances accuracy and efficiency, the most critical operations — final fitting, surface finishing, and quality inspection — are always performed by hand.</p>

<h2>Expert Tips</h2>
<p>Based on our experience, here are some practical insights that can make a real difference in your woodworking projects:</p>
<ul>
<li>Always allow timber to acclimatise to its final environment before working it — this prevents warping and cracking after installation.</li>
<li>Invest in sharp tools. A sharp blade produces cleaner cuts, reduces tear-out, and is actually safer to use than a dull one.</li>
<li>Test your finish on a scrap piece of the same timber before applying it to your project. Different species absorb finishes differently.</li>
<li>When designing joints, consider both the structural requirements and the seasonal movement of the wood.</li>
</ul>

<h2>Conclusion</h2>
<p>The world of fine woodworking is endlessly rewarding. Whether you are commissioning a bespoke piece or simply appreciating the craft, we hope this guide has deepened your understanding and appreciation of this timeless art form.</p>

<p>If you would like to discuss a project or visit our workshop, please do not hesitate to get in touch. Our team is always happy to share their knowledge and passion for exceptional woodcraft.</p>`;
}

// ─── Testimonial Data ─────────────────────────────────────
const testimonialAuthors = [
  "Jean-Pierre Duval",
  "Sophie Laurent",
  "Rajesh Doobur",
  "Marie-Claire Ng",
  "James Worthington",
  "Isabelle Rambert",
  "Vikram Doorgakant",
  "Patricia Chen",
  "Alexander Ross",
  "Aïsha Beebeejaun",
  "David Leclerc",
  "Nadia Hossenbux",
  "Marcus Forde",
  "Céline Ramasawmy",
  "Timothy O'Brien",
  "Fatima Jeetoo",
  "Pierre-Louis Martin",
  "Anushka Mungur",
  "Richard Blackwell",
  "Hannah Boodhoo",
];

const testimonialContents = [
  "Venice Wood Ltd transformed our home with the most exquisite custom cabinetry I have ever seen. Every detail was perfect, from the grain matching to the silky-smooth finish. Their craftsmen are true artists.",
  "We commissioned a complete dining room set — table for twelve and matching chairs. The quality is extraordinary. Three years on, it still draws compliments from every guest who visits.",
  "The team at Venice Wood restored our colonial-era staircase with incredible sensitivity and skill. They matched the original wood species and joinery techniques perfectly. It looks better than new.",
  "Our kitchen renovation exceeded every expectation. The custom maple cabinets are flawless, the soft-close mechanisms work beautifully, and the whole project was delivered on schedule.",
  "Working with Venice Wood on our hotel renovation was a pleasure from start to finish. Professional, creative, and meticulous. The bespoke reception desk is now our signature piece.",
  "I ordered a walnut executive desk for my home office and it is, without exaggeration, the finest piece of furniture I own. The dovetail joints are works of art in themselves.",
  "The outdoor teak furniture Venice Wood made for our terrace has weathered two cyclone seasons beautifully. Built to endure, built to impress. Absolutely worth the investment.",
  "From the initial design consultation through to installation, the Venice Wood team demonstrated unmatched expertise and genuine passion for their craft. Our wine cellar is spectacular.",
  "The floating shelves and built-in wardrobes Venice Wood installed throughout our villa are stunning. The attention to detail — perfectly aligned grain, invisible fixings — sets them apart.",
  "We needed period-accurate replacement panels for our heritage property. Venice Wood sourced matching timber and reproduced the original profiles with astonishing accuracy.",
  "The custom bookshelf they built for our library is a masterpiece. Floor to ceiling, with rolling ladder — it looks like something from an English country house.",
  "Venice Wood created a beautiful oak frame for a large mirror in our boutique hotel lobby. Simple brief, incredible execution. Guests constantly ask who made it.",
  "Our garden pavilion by Venice Wood is the highlight of our outdoor space. The cedar structure is elegant, sturdy, and already developing a gorgeous silver patina.",
  "The team replaced all the internal doors in our home with solid hardwood ones. The difference in feel, sound, and appearance is remarkable. A true upgrade.",
  "We hired Venice Wood for commercial shelving in our retail store. They delivered a design that is both functional and beautiful — it showcases our products perfectly.",
  "The bespoke bed frame Venice Wood made for our master bedroom is simply divine. The gentle curves, the warm cherry wood, the silky finish — pure luxury.",
  "After seeing their work at a friend's house, we commissioned a garden bench and matching planters. Superb quality and the design fits our garden perfectly.",
  "Venice Wood built custom window seats throughout our seaside property. They selected teak for its durability and the result is both practical and gorgeous.",
  "The craftsmanship of the staircase handrail Venice Wood carved for our townhouse is breathtaking. Every curve is fluid, every joint invisible.",
  "We commissioned matching his-and-hers dressers in figured walnut. The wood selection was impeccable — the mirrored grain patterns across the pair are a beautiful touch.",
];

// ─── Main Populate Function ──────────────────────────────
async function populate() {
  console.log("Starting database populate...\n");

  // Connect databases
  await connectMongoDB();
  await sequelize.authenticate();
  await sequelize.sync();
  console.log("Databases connected\n");

  const bucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: "images",
  });
  loadImages();

  // Get or create admin user
  let admin = await AdminUser.findOne({ where: { username: "admin" } });
  if (!admin) {
    console.log(
      "No admin user found. Please run 'node scripts/createDefaultAdmin.js' first.",
    );
    process.exit(1);
  }
  console.log(`Using admin: ${admin.name} (${admin.id})\n`);

  // ── Create Categories ──
  console.log("Creating categories...");
  for (let i = 0; i < 10; i++) {
    for (const [names, type] of [
      [productCategoryNames, "product"],
      [projectCategoryNames, "project"],
      [blogCategoryNames, "blog"],
      [productCategoryNames, "inquiry"], // inquiries use same category names as products
    ]) {
      try {
        await Category.findOrCreate({
          where: { slug: slugify(names[i]), type },
          defaults: {
            name: names[i],
            slug: slugify(names[i]),
            type,
            description: `${names[i]} — curated collection of ${type} entries.`,
            color: categoryColors[i],
            isActive: true,
            sortOrder: i + 1,
          },
        });
      } catch {
        // Skip if name already exists (inquiry shares names with product)
      }
    }
  }
  console.log("  Categories created (10 per type)\n");

  // ── Create Products ──
  console.log("Creating products...");
  for (let i = 0; i < 20; i++) {
    const name = productNames[i];
    const slug = slugify(name);
    const isFeatured = i < 5;
    const catName = productCategoryNames[i % 10];
    const woodType = woodTypes[i % woodTypes.length];
    const dims = {
      width: `${80 + i * 5}cm`,
      height: `${70 + i * 3}cm`,
      depth: `${40 + i * 2}cm`,
    };

    // Upload main image
    const mainImg = pick(imageFiles);
    const mainUpload = await uploadImage(bucket, mainImg);

    const [product] = await Product.findOrCreate({
      where: { slug },
      defaults: {
        name,
        slug,
        description: productDescriptions[i % productDescriptions.length],
        longDescription:
          productLongDescriptions[i % productLongDescriptions.length],
        category: catName,
        seoTags: `${name}, ${woodType}, custom furniture, Venice Wood, Mauritius, bespoke woodwork`,
        image: mainUpload._id.toString(),
        featured: isFeatured,
        status: "published",
        wood_type: woodType,
        material: materials[i % materials.length],
        finish: finishes[i % finishes.length],
        joinery: joineryTypes[i % joineryTypes.length],
        delivery: deliveryOptions[i % deliveryOptions.length],
        dimensions: dims,
        specifications: [
          { key: "Wood Species", value: woodType },
          { key: "Finish", value: finishes[i % finishes.length] },
          { key: "Joinery", value: joineryTypes[i % joineryTypes.length] },
          { key: "Weight", value: `${25 + i * 3}kg` },
          { key: "Assembly", value: "Delivered fully assembled" },
        ],
        features: [
          "Hand-selected premium timber",
          "Traditional joinery construction",
          "Hand-applied finish",
          "Custom dimensions available",
          "Lifetime structural warranty",
        ],
        createdBy: admin.id,
        views: Math.floor(Math.random() * 500) + 50,
      },
    });

    // Create main Media doc
    await Media.findOneAndUpdate(
      { productId: product.id, type: "main" },
      {
        productId: product.id,
        fileId: mainUpload._id,
        fileName: mainUpload.filename,
        fileSize: mainUpload.length,
        mimeType: mainUpload.contentType,
        type: "main",
        uploadedBy: admin.id,
      },
      { upsert: true, new: true },
    );

    // Upload 5 gallery images
    const galleryImages = pickN(imageFiles, 5);
    for (const gImg of galleryImages) {
      const gUpload = await uploadImage(bucket, gImg);
      await Media.create({
        productId: product.id,
        fileId: gUpload._id,
        fileName: gUpload.filename,
        fileSize: gUpload.length,
        mimeType: gUpload.contentType,
        type: "gallery",
        uploadedBy: admin.id,
      });
    }

    console.log(`  [${i + 1}/20] ${name}${isFeatured ? " ★" : ""}`);
    await delay(200);
  }
  console.log("  Products complete\n");

  // ── Create Projects ──
  console.log("Creating projects...");
  for (let i = 0; i < 20; i++) {
    const name = projectNames[i];
    const slug = slugify(name);
    const isFeatured = i < 5;
    const catName = projectCategoryNames[i % 10];
    const primaryWood = woodTypes[i % woodTypes.length];
    const completionDate = new Date(2023, i % 12, 1 + i);
    const projectMaterials = pickN(woodTypes, 3);
    const projectTechniques = pickN(techniques, 4);

    // Upload main image
    const mainImg = pick(imageFiles);
    const mainUpload = await uploadImage(bucket, mainImg);

    const [project] = await Project.findOrCreate({
      where: { slug },
      defaults: {
        name,
        slug,
        title: name,
        description: `A prestigious ${catName.toLowerCase()} project completed for ${clients[i]} in ${locations[i]}. This commission showcased our expertise in ${primaryWood.toLowerCase()} craftsmanship and bespoke design.`,
        longDescription: `This remarkable project for ${clients[i]} required meticulous planning and execution over several months. Located in ${locations[i]}, the brief demanded a perfect blend of functionality, aesthetics, and durability.\n\nOur team of master craftsmen worked exclusively with premium ${primaryWood.toLowerCase()} timber, hand-selected for its exceptional grain character and structural integrity. Every joint was cut by hand using traditional techniques, ensuring both beauty and longevity.\n\nThe project involved close collaboration with the client's design team to ensure every element reflected their vision while meeting our exacting quality standards. From initial concept sketches through to final installation, no detail was overlooked.\n\nThe result is a space that celebrates the natural beauty of wood while serving its intended purpose flawlessly. We are proud to count this among our most accomplished works.`,
        category: catName,
        image: mainUpload._id.toString(),
        featured: isFeatured,
        primaryWood,
        client: clients[i],
        location: locations[i],
        completionDate,
        dimensions: {
          area: `${50 + i * 10}m²`,
          height: `${2.4 + (i % 5) * 0.2}m`,
        },
        materials: projectMaterials,
        techniques: projectTechniques,
        specifications: [
          { key: "Primary Wood", value: primaryWood },
          { key: "Area", value: `${50 + i * 10}m²` },
          { key: "Duration", value: `${3 + (i % 6)} months` },
          { key: "Finish", value: finishes[i % finishes.length] },
        ],
        timeline: [
          { phase: "Design & Planning", duration: "2-3 weeks" },
          { phase: "Material Sourcing", duration: "1-2 weeks" },
          { phase: "Fabrication", duration: `${4 + (i % 8)} weeks` },
          { phase: "Installation", duration: "1-2 weeks" },
          { phase: "Final Finishing", duration: "1 week" },
        ],
        testimonial: {
          author: clients[i],
          content: `Working with Venice Wood on this project was an exceptional experience. Their craftsmanship and attention to detail exceeded our expectations.`,
          rating: 5,
        },
        seoTags: `${name}, ${catName}, ${primaryWood}, woodworking project, Mauritius, Venice Wood`,
        status: "published",
        createdBy: admin.id,
        views: Math.floor(Math.random() * 300) + 30,
      },
    });

    // Create main Media doc
    await Media.findOneAndUpdate(
      { projectId: project.id, type: "main" },
      {
        projectId: project.id,
        fileId: mainUpload._id,
        fileName: mainUpload.filename,
        fileSize: mainUpload.length,
        mimeType: mainUpload.contentType,
        type: "main",
        uploadedBy: admin.id,
      },
      { upsert: true, new: true },
    );

    // Upload 5 gallery images
    const galleryImages = pickN(imageFiles, 5);
    for (const gImg of galleryImages) {
      const gUpload = await uploadImage(bucket, gImg);
      await Media.create({
        projectId: project.id,
        fileId: gUpload._id,
        fileName: gUpload.filename,
        fileSize: gUpload.length,
        mimeType: gUpload.contentType,
        type: "gallery",
        uploadedBy: admin.id,
      });
    }

    console.log(`  [${i + 1}/20] ${name}${isFeatured ? " ★" : ""}`);
    await delay(200);
  }
  console.log("  Projects complete\n");

  // ── Create Blogs ──
  console.log("Creating blogs...");
  for (let i = 0; i < 20; i++) {
    const title = blogTitles[i];
    const slug = slugify(title);
    const catName = blogCategoryNames[i % 10];
    const excerpt = blogExcerpts[i % blogExcerpts.length];
    const publishedDate = new Date(2024, i % 12, 1 + (i % 28));

    // Upload featured image
    const featImg = pick(imageFiles);
    const featUpload = await uploadImage(bucket, featImg);

    const [blog] = await Blog.findOrCreate({
      where: { slug },
      defaults: {
        title,
        slug,
        excerpt,
        content: generateBlogContent(title),
        category: catName,
        status: "published",
        featured: i < 5,
        author: "Venice Wood Ltd",
        createdBy: admin.id,
        seoTags: `${title}, woodworking, ${catName}, Venice Wood, Mauritius`,
        readingTime: 3 + Math.floor(Math.random() * 8),
        views: Math.floor(Math.random() * 1000) + 100,
        publishedAt: publishedDate,
      },
    });

    // Create featured Media doc
    await Media.findOneAndUpdate(
      { blogId: blog.id, type: "featured" },
      {
        blogId: blog.id,
        fileId: featUpload._id,
        fileName: featUpload.filename,
        fileSize: featUpload.length,
        mimeType: featUpload.contentType,
        type: "featured",
        uploadedBy: admin.id,
      },
      { upsert: true, new: true },
    );

    console.log(`  [${i + 1}/20] ${title}`);
    await delay(200);
  }
  console.log("  Blogs complete\n");

  // ── Create Testimonials ──
  console.log("Creating testimonials...");
  for (let i = 0; i < 20; i++) {
    const author = testimonialAuthors[i];
    const isFeatured = i < 5;

    await Testimonial.findOrCreate({
      where: { author },
      defaults: {
        author,
        content: testimonialContents[i],
        rating: 4 + Math.round(Math.random()),
        featured: isFeatured,
      },
    });

    console.log(`  [${i + 1}/20] ${author}${isFeatured ? " ★" : ""}`);
  }
  console.log("  Testimonials complete\n");

  // ── Summary ──
  const [pCount, prCount, bCount, tCount, catCount, mediaCount] =
    await Promise.all([
      Product.count(),
      Project.count(),
      Blog.count(),
      Testimonial.count(),
      Category.count(),
      Media.countDocuments(),
    ]);

  console.log("═══════════════════════════════════════════");
  console.log("  Database populated successfully!");
  console.log("═══════════════════════════════════════════");
  console.log(`  Products:     ${pCount}`);
  console.log(`  Projects:     ${prCount}`);
  console.log(`  Blogs:        ${bCount}`);
  console.log(`  Testimonials: ${tCount}`);
  console.log(`  Categories:   ${catCount}`);
  console.log(`  Media files:  ${mediaCount}`);
  console.log("═══════════════════════════════════════════\n");

  await mongoose.disconnect();
  await sequelize.close();
  process.exit(0);
}

populate().catch((err) => {
  console.error("Populate error:", err);
  process.exit(1);
});
