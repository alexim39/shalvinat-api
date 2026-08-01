import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const counterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export const Counter = (models.Counter || model("Counter", counterSchema)) as any;
