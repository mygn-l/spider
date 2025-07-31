import puppeteer from "puppeteer";
import { URL } from "url";
import url_model from "./models/url.js";
import mongoose from "mongoose";
import db_config from "./config.js";

await mongoose.connect(db_config);

const browser = await puppeteer.launch({
  headless: true,
});
const page = await browser.newPage();
page.setDefaultTimeout(5000);
await page.setViewport({ width: 1000, height: 1000 });

let urls_to_visit = ["www.reddit.com"];

let iterations = 0;
const loop = async function () {
  console.log("---------------------------------");
  console.log("Iteration: " + iterations);
  const unprocessed_urls = [];
  for (const url_to_visit of urls_to_visit) {
    const full_url = "https://" + url_to_visit;
    console.log(full_url);
    try {
      await page.goto(full_url);
      await page.waitForSelector("a");
      await page.waitForSelector("meta");
      await page.waitForSelector("title");
    } catch {
      continue;
    }

    const meta = await page.evaluate(function () {
      const desc = document.querySelector("head > meta[name='description']");
      const keywords = document.querySelector("head > meta[name='keywords']");
      const title = document.querySelector("head > title");

      const to_return = {};
      if (desc) {
        to_return.desc = desc.innerHTML;
      } else {
        to_return.desc = "";
      }
      if (keywords) {
        to_return.keywords = keywords.innerHTML;
      } else {
        to_return.keywords = "";
      }
      if (title) {
        to_return.title = title.innerHTML;
      } else {
        to_return.title = "";
      }
      return to_return;
    });

    try {
      const url_obj = new URL(full_url);
      const base_url = url_obj.hostname;
      const desc = meta.desc;
      const keywords = meta.keywords.split(",").map(function (e) {
        return e.trim();
      });
      const title = meta.title;
      await url_model.findOneAndUpdate(
        { base: base_url },
        { base: base_url, keywords: keywords, desc: desc, title: title },
        { upsert: true }
      );
    } catch {}

    const new_urls = await page.evaluate(function () {
      const as = document.querySelectorAll("a");
      const hrefs = [];
      for (const a of as) {
        hrefs.push(a.getAttribute("href"));
      }
      return hrefs;
    });
    unprocessed_urls.push(...new_urls);
  }

  urls_to_visit = [];
  for (const new_url of unprocessed_urls) {
    try {
      const url_obj = new URL(new_url);
      urls_to_visit.push(url_obj.hostname);
      urls_to_visit.push(url_obj.hostname + url_obj.pathname);
    } catch {}
  }

  iterations++;
  if (iterations < 4) {
    loop();
  }
};
loop();
