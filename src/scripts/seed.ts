import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { Bed, Staff } from "../models/management.model.js";
import { Patient } from "../models/patient.model.js";
import { Drug, InventoryBatch } from "../models/pharmacy.model.js";
import { User } from "../models/user.model.js";
import { Visit } from "../models/visit.model.js";
import { makeVisitNumber } from "../utils/ids.js";
import { nextPatientNumber, nextQueueNumber } from "../utils/sequences.js";

const password = "Shalvinat@2026!";

const users = [
  { fullName: "Director User", email: "director@shalvinat.local", roles: ["director"], department: "Executive" },
  { fullName: "Reception User", email: "reception@shalvinat.local", roles: ["reception"], department: "Reception" },
  { fullName: "Nurse User", email: "nurse@shalvinat.local", roles: ["nurse"], department: "Nursing" },
  { fullName: "Doctor User", email: "doctor@shalvinat.local", roles: ["doctor"], department: "OPD" },
  { fullName: "Pharmacy User", email: "pharmacy@shalvinat.local", roles: ["pharmacy"], department: "Pharmacy" },
  { fullName: "Lab User", email: "lab@shalvinat.local", roles: ["laboratory"], department: "Laboratory" },
  { fullName: "Radiology User", email: "radiology@shalvinat.local", roles: ["radiology"], department: "Radiology" },
  { fullName: "Manager User", email: "manager@shalvinat.local", roles: ["manager"], department: "Administration" },
  { fullName: "Accountant User", email: "accountant@shalvinat.local", roles: ["accountant"], department: "Accounting" },
  { fullName: "Accounts Manager User", email: "accounts_manager@shalvinat.local", roles: ["accounts_manager"], department: "Accounting" },
] as const;

async function seed() {
  await connectDatabase();

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  for (const user of users) {
    const createdUser = await User.findOneAndUpdate(
      { email: user.email },
      {
        ...user,
        passwordHash,
        status: "active",
        mustChangePassword: false,
        failedLoginAttempts: 0,
        $unset: { lockedUntil: "" },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    await Staff.findOneAndUpdate(
      { user: createdUser._id },
      {
        user: createdUser._id,
        fullName: user.fullName,
        role: user.roles[0],
        email: user.email,
        department: user.department,
        designation: user.roles[0],
        employmentType: "full_time",
        startDate: new Date("2026-01-01"),
        leaveBalanceDays: 20,
        platformAccessEnabled: true,
        status: "active",
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
  }

  const reception = await User.findOne({ email: "reception@shalvinat.local" });

  if (reception && !(await Patient.exists({ phone: "08039451320" }))) {
    const patient = await Patient.create({
      patientNumber: await nextPatientNumber(),
      firstName: "Grace",
      lastName: "Finipiri",
      dateOfBirth: new Date("1988-03-16"),
      gender: "female",
      bloodGroup: "O+",
      genotype: "AA",
      nationality: "Nigerian",
      stateOfOrigin: "Rivers",
      lgaOfOrigin: "Bonny",
      residentialAddress: "Walter Finipiri Street, Bonny Island",
      phone: "08039451320",
      category: "individual",
      allergies: ["penicillin"],
      nextOfKin: {
        name: "Tamuno Finipiri",
        relationship: "Spouse",
        phone: "08052602806",
      },
      createdBy: reception._id,
    });

    await Visit.create({
      visitNumber: makeVisitNumber(),
      patient: patient._id,
      visitType: "opd",
      department: "OPD",
      queueNumber: await nextQueueNumber("OPD"),
      status: "queued",
      paymentStatus: "pending",
      createdBy: reception._id,
    });
  }

  const paracetamol = await Drug.findOneAndUpdate(
    { genericName: "Paracetamol", strength: "500mg" },
    {
      genericName: "Paracetamol",
      brandNames: ["Panadol"],
      strength: "500mg",
      dosageForm: "Tablet",
      category: "otc",
      reorderLevel: 50,
      active: true,
    },
    { upsert: true, returnDocument: "after" },
  );

  const amoxicillin = await Drug.findOneAndUpdate(
    { genericName: "Amoxicillin", strength: "500mg" },
    {
      genericName: "Amoxicillin",
      brandNames: ["Amoxil"],
      strength: "500mg",
      dosageForm: "Capsule",
      category: "prescription",
      reorderLevel: 30,
      active: true,
    },
    { upsert: true, returnDocument: "after" },
  );

  const pharmacyUser = await User.findOne({ email: "pharmacy@shalvinat.local" });
  if (pharmacyUser) {
    for (const drug of [paracetamol, amoxicillin]) {
      await InventoryBatch.findOneAndUpdate(
        { drug: drug._id, batchNumber: "DEV-001" },
        {
          drug: drug._id,
          batchNumber: "DEV-001",
          location: "main_pharmacy",
          quantityOnHand: 120,
          unitCost: 20,
          sellingPrice: 50,
          expiryDate: new Date("2027-12-31"),
          supplier: "Demo Medical Supplies",
          receivedBy: pharmacyUser._id,
        },
        { upsert: true, returnDocument: "after" },
      );
    }
  }

  for (const bed of [
    { ward: "General Ward", bedNumber: "G-01", category: "general" },
    { ward: "General Ward", bedNumber: "G-02", category: "general" },
    { ward: "Maternity", bedNumber: "M-01", category: "maternity" },
    { ward: "ICU", bedNumber: "ICU-01", category: "icu" },
  ] as const) {
    await Bed.findOneAndUpdate({ ward: bed.ward, bedNumber: bed.bedNumber }, bed, {
      upsert: true,
      returnDocument: "after",
    });
  }

  console.log("Seed completed.");
  console.log(`Demo password for all accounts: ${password}`);
  await disconnectDatabase();
}

seed().catch(async (error) => {
  console.error(error);
  await disconnectDatabase();
  process.exit(1);
});
