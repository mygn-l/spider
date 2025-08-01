import fs from "fs";

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

let urls_to_visit = [
  "www.reddit.com",
  "www.facebook.com/marianopolis",
  "www.youtube.com",
];
if (fs.existsSync("./resume-url.json")) {
  urls_to_visit = JSON.parse(fs.readFileSync("./resume-url.json"));
}

const loop = async function () {
  console.log("---------------------------------");
  const unprocessed_urls = [];

  for (const url_to_visit of urls_to_visit) {
    const full_url = "https://" + url_to_visit;
    try {
      await page.goto(full_url);
    } catch {
      continue;
    }

    try {
      await page.waitForSelector("a");
      await page.waitForSelector("meta");
      await page.waitForSelector("title");
      await page.waitForNetworkIdle();
      await page.waitForNavigation();
    } catch {}

    try {
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

      const url_obj = new URL(full_url);
      const base_url = url_obj.hostname;
      const desc = meta.desc;
      const keywords = meta.keywords.split(",").map(function (e) {
        return e.trim();
      });
      const title = meta.title;
      let res = await url_model.findOneAndUpdate(
        { base: base_url },
        { base: base_url, keywords: keywords, desc: desc, title: title },
        { upsert: true }
      );
      if (res == null) {
        console.log(base_url);
      }
    } catch {}

    try {
      const new_urls = await page.evaluate(function () {
        const as = document.querySelectorAll("a");
        const hrefs = [];
        for (const a of as) {
          try {
            if (hrefs.includes(a.getAttribute("href")) == false) {
              hrefs.push(a.getAttribute("href"));
            }
          } catch {}
        }
        return hrefs;
      });
      unprocessed_urls.push(...new_urls);
    } catch {}
  }

  urls_to_visit = [];
  for (const new_url of unprocessed_urls) {
    try {
      const url_obj = new URL(new_url);
      urls_to_visit.push(url_obj.hostname);
      urls_to_visit.push(url_obj.hostname + url_obj.pathname);
    } catch {}
  }

  if (urls_to_visit.length < 1) {
    const docs = await url_model.aggregate([{ $sample: { size: 10 } }]);
    for (const doc of docs) {
      urls_to_visit.push(doc.base);
    }
  }

  let selected_urls_to_visit = [];
  let num_urls = Math.min(urls_to_visit.length, 20);
  for (let i = 0; i < num_urls; i++) {
    let random_index = Math.floor(Math.random() * urls_to_visit.length);
    selected_urls_to_visit.push(urls_to_visit[random_index]);
  }
  urls_to_visit = selected_urls_to_visit;

  fs.writeFileSync("./resume-url.json", JSON.stringify(urls_to_visit));

  setTimeout(loop, 3000);
};
loop();
