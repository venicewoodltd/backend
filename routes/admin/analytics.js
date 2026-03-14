/**
 * Production Admin Analytics Routes
 */

import express from "express";
import mongoose from "mongoose";
import { adminAuth } from "../../middlewares/adminAuth.js";
import logger from "../../config/logger.js";

const router = express.Router();

// GET /visits — Visit statistics over time
router.get("/visits", adminAuth, async (req, res) => {
  try {
    const { period = "6months" } = req.query;
    const db = mongoose.connection.db;
    const PageVisit = db.collection("pagevisits");
    const now = new Date();
    let startDate, groupByFormat;

    switch (period) {
      case "7days":
        startDate = new Date(now.getTime() - 7 * 86400000);
        groupByFormat = {
          $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
        };
        break;
      case "30days":
        startDate = new Date(now.getTime() - 30 * 86400000);
        groupByFormat = {
          $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
        };
        break;
      case "3months":
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        groupByFormat = {
          $dateToString: { format: "%Y-%m", date: "$timestamp" },
        };
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        groupByFormat = {
          $dateToString: { format: "%Y-%m", date: "$timestamp" },
        };
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        groupByFormat = {
          $dateToString: { format: "%Y-%m", date: "$timestamp" },
        };
    }

    const [visitStats, totalVisits, uniqueSessions] = await Promise.all([
      PageVisit.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        { $group: { _id: groupByFormat, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      PageVisit.countDocuments({ timestamp: { $gte: startDate } }),
      PageVisit.distinct("sessionId", { timestamp: { $gte: startDate } }),
    ]);

    res.json({
      success: true,
      period,
      startDate,
      data: visitStats.map((s) => ({ date: s._id, visits: s.count })),
      totalVisits,
      uniqueVisitors: uniqueSessions.length,
    });
  } catch (error) {
    logger.error("Analytics visits error", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch analytics" });
  }
});

// GET /summary — Summary statistics
router.get("/summary", adminAuth, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const PageVisit = db.collection("pagevisits");
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [todayVisits, thisMonthVisits, lastMonthVisits, totalVisits] =
      await Promise.all([
        PageVisit.countDocuments({ timestamp: { $gte: today } }),
        PageVisit.countDocuments({ timestamp: { $gte: thisMonth } }),
        PageVisit.countDocuments({
          timestamp: { $gte: lastMonth, $lt: thisMonth },
        }),
        PageVisit.countDocuments(),
      ]);

    res.json({
      success: true,
      todayVisits,
      thisMonthVisits,
      lastMonthVisits,
      totalVisits,
      trend:
        lastMonthVisits > 0
          ? (
              ((thisMonthVisits - lastMonthVisits) / lastMonthVisits) *
              100
            ).toFixed(1)
          : 0,
    });
  } catch (error) {
    logger.error("Analytics summary error", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to fetch summary" });
  }
});

export default router;
