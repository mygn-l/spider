import mongoose from "mongoose";

const object = {
  base: String,
  keywords: [String],
  desc: String,
  title: String,
};

const schema = new mongoose.Schema(object);

const model = mongoose.model("Url", schema);

export default model;
