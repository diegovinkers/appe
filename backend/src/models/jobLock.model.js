import mongoose from "mongoose";

// Lock por job programado: si hay varias instancias del servidor, solo una corre cada job.
const jobLockSchema = new mongoose.Schema(
  {
    _id: { type: String }, // nombre del job
    lockedUntil: { type: Date, default: null },
    lockedBy: { type: String },
  },
  { versionKey: false }
);

export default mongoose.models.JobLock || mongoose.model("JobLock", jobLockSchema);
