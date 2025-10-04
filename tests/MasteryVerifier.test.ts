import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, asciiCV, buffCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_COURSE_ID = 101;
const ERR_INVALID_SCORE = 103;
const ERR_INVALID_THRESHOLD = 104;
const ERR_INVALID_PROOF = 105;
const ERR_ALREADY_VERIFIED = 106;
const ERR_NOT_VERIFIED = 107;
const ERR_ORACLE_NOT_VERIFIED = 109;
const ERR_INVALID_VERIFICATION_TYPE = 115;
const ERR_INVALID_DIFFICULTY = 116;
const ERR_INVALID_EXPIRY = 117;
const ERR_INVALID_METADATA = 118;
const ERR_MAX_VERIFICATIONS_EXCEEDED = 114;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_NFT_ALREADY_ISSUED = 122;
const ERR_TRANSFER_FAILED = 121;

interface Verification {
  courseId: number;
  user: string;
  score: number;
  threshold: number;
  proofHash: Buffer;
  timestamp: number;
  verifier: string;
  verificationType: string;
  difficulty: number;
  expiry: number;
  metadata: string;
  status: boolean;
}

interface VerificationUpdate {
  updateScore: number;
  updateThreshold: number;
  updateTimestamp: number;
  updater: string;
}

interface Certificate {
  verificationId: number;
  owner: string;
  issuedAt: number;
  metadata: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class MasteryVerifierMock {
  state: {
    nextVerificationId: number;
    maxVerifications: number;
    verificationFee: number;
    oraclePrincipal: string | null;
    rewardContract: string | null;
    nftContract: string | null;
    adminPrincipal: string;
    verifications: Map<number, Verification>;
    verificationsByUser: Map<string, number>;
    verificationUpdates: Map<number, VerificationUpdate>;
    certificates: Map<number, Certificate>;
  } = this.resetState();
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  nftMints: Array<{ owner: string; id: number }> = [];
  rewardsDistributed: Array<{ user: string; amount: number }> = [];

  private resetState() {
    return {
      nextVerificationId: 0,
      maxVerifications: 10000,
      verificationFee: 500,
      oraclePrincipal: null,
      rewardContract: null,
      nftContract: null,
      adminPrincipal: "ST1TEST",
      verifications: new Map(),
      verificationsByUser: new Map(),
      verificationUpdates: new Map(),
      certificates: new Map(),
    };
  }

  constructor() {
    this.reset();
  }

  reset() {
    this.state = this.resetState();
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.nftMints = [];
    this.rewardsDistributed = [];
  }

  setOraclePrincipal(newOracle: string): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newOracle === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_NOT_VERIFIED };
    this.state.oraclePrincipal = newOracle;
    return { ok: true, value: true };
  }

  setRewardContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (contract === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_NOT_VERIFIED };
    this.state.rewardContract = contract;
    return { ok: true, value: true };
  }

  setNftContract(contract: string): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (contract === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_NOT_VERIFIED };
    this.state.nftContract = contract;
    return { ok: true, value: true };
  }

  setVerificationFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee < 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    this.state.verificationFee = newFee;
    return { ok: true, value: true };
  }

  setMaxVerifications(newMax: number): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    this.state.maxVerifications = newMax;
    return { ok: true, value: true };
  }

  submitVerification(
    courseId: number,
    score: number,
    threshold: number,
    proofHash: Buffer,
    verificationType: string,
    difficulty: number,
    expiry: number,
    metadata: string
  ): Result<number> {
    if (this.state.nextVerificationId >= this.state.maxVerifications) return { ok: false, value: ERR_MAX_VERIFICATIONS_EXCEEDED };
    if (courseId <= 0) return { ok: false, value: ERR_INVALID_COURSE_ID };
    if (score < 0 || score > 100) return { ok: false, value: ERR_INVALID_SCORE };
    if (threshold <= 0 || threshold > 100) return { ok: false, value: ERR_INVALID_THRESHOLD };
    if (proofHash.length !== 32) return { ok: false, value: ERR_INVALID_PROOF };
    if (!["quiz", "oracle", "challenge"].includes(verificationType)) return { ok: false, value: ERR_INVALID_VERIFICATION_TYPE };
    if (difficulty < 1 || difficulty > 10) return { ok: false, value: ERR_INVALID_DIFFICULTY };
    if (expiry <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRY };
    if (metadata.length > 256) return { ok: false, value: ERR_INVALID_METADATA };
    const userKey = `${this.caller}-${courseId}`;
    if (this.state.verificationsByUser.has(userKey)) return { ok: false, value: ERR_ALREADY_VERIFIED };
    const isOracle = verificationType === "oracle";
    if (isOracle && this.caller !== this.state.oraclePrincipal) return { ok: false, value: ERR_ORACLE_NOT_VERIFIED };
    this.stxTransfers.push({ amount: this.state.verificationFee, from: this.caller, to: this.state.adminPrincipal });

    const id = this.state.nextVerificationId;
    const status = score >= threshold;
    const verification: Verification = {
      courseId,
      user: this.caller,
      score,
      threshold,
      proofHash,
      timestamp: this.blockHeight,
      verifier: isOracle ? this.caller : "SP000000000000000000002Q6VF78",
      verificationType,
      difficulty,
      expiry,
      metadata,
      status,
    };
    this.state.verifications.set(id, verification);
    this.state.verificationsByUser.set(userKey, id);
    this.state.nextVerificationId++;
    if (status) {
      this.issueCertificateInternal(id, this.caller, metadata);
    }
    return { ok: true, value: id };
  }

  private issueCertificateInternal(verificationId: number, owner: string, metadata: string): void {
    if (!this.state.nftContract) return;
    const nftId = verificationId;
    if (this.state.certificates.has(nftId)) return;
    const certificate: Certificate = {
      verificationId,
      owner,
      issuedAt: this.blockHeight,
      metadata,
    };
    this.state.certificates.set(nftId, certificate);
    this.nftMints.push({ owner, id: nftId });
    this.triggerReward(verificationId);
  }

  private triggerReward(verificationId: number): void {
    if (!this.state.rewardContract) return;
    const verification = this.state.verifications.get(verificationId);
    if (!verification || !verification.status) return;
    const amount = verification.difficulty * 100;
    this.rewardsDistributed.push({ user: verification.user, amount });
  }

  getVerification(id: number): Verification | undefined {
    return this.state.verifications.get(id);
  }

  updateVerification(id: number, newScore: number, newThreshold: number): Result<boolean> {
    const verification = this.state.verifications.get(id);
    if (!verification) return { ok: false, value: ERR_NOT_VERIFIED };
    if (verification.user !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newScore < 0 || newScore > 100) return { ok: false, value: ERR_INVALID_SCORE };
    if (newThreshold <= 0 || newThreshold > 100) return { ok: false, value: ERR_INVALID_THRESHOLD };
    const updated: Verification = {
      ...verification,
      score: newScore,
      threshold: newThreshold,
      timestamp: this.blockHeight,
      status: newScore >= newThreshold,
    };
    this.state.verifications.set(id, updated);
    this.state.verificationUpdates.set(id, {
      updateScore: newScore,
      updateThreshold: newThreshold,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getVerificationCount(): Result<number> {
    return { ok: true, value: this.state.nextVerificationId };
  }

  checkVerificationStatus(user: string, courseId: number): Result<boolean> {
    const userKey = `${user}-${courseId}`;
    const id = this.state.verificationsByUser.get(userKey);
    if (id === undefined) return { ok: true, value: false };
    const v = this.state.verifications.get(id);
    return { ok: true, value: v ? v.status : false };
  }
}

describe("MasteryVerifier", () => {
  let contract: MasteryVerifierMock;

  beforeEach(() => {
    contract = new MasteryVerifierMock();
    contract.reset();
  });

  it("submits verification successfully", () => {
    contract.setOraclePrincipal("ST2ORACLE");
    contract.setNftContract("ST3NFT");
    contract.setRewardContract("ST4REWARD");
    const proof = Buffer.alloc(32);
    const result = contract.submitVerification(
      1,
      85,
      70,
      proof,
      "quiz",
      5,
      1000,
      "Mastery in Algebra"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const v = contract.getVerification(0);
    expect(v?.courseId).toBe(1);
    expect(v?.user).toBe("ST1TEST");
    expect(v?.score).toBe(85);
    expect(v?.threshold).toBe(70);
    expect(v?.verificationType).toBe("quiz");
    expect(v?.difficulty).toBe(5);
    expect(v?.expiry).toBe(1000);
    expect(v?.metadata).toBe("Mastery in Algebra");
    expect(v?.status).toBe(true);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST1TEST" }]);
    expect(contract.nftMints).toEqual([{ owner: "ST1TEST", id: 0 }]);
    expect(contract.rewardsDistributed).toEqual([{ user: "ST1TEST", amount: 500 }]);
  });

  it("rejects duplicate verification", () => {
    contract.setOraclePrincipal("ST2ORACLE");
    const proof = Buffer.alloc(32);
    contract.submitVerification(1, 85, 70, proof, "quiz", 5, 1000, "Test");
    const result = contract.submitVerification(1, 90, 80, proof, "quiz", 6, 2000, "Test2");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_VERIFIED);
  });

  it("rejects invalid score", () => {
    const proof = Buffer.alloc(32);
    const result = contract.submitVerification(1, 101, 70, proof, "quiz", 5, 1000, "Test");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SCORE);
  });

  it("submits oracle verification", () => {
    contract.setOraclePrincipal("ST1TEST");
    const proof = Buffer.alloc(32);
    const result = contract.submitVerification(2, 95, 90, proof, "oracle", 8, 5000, "Advanced");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const v = contract.getVerification(0);
    expect(v?.verifier).toBe("ST1TEST");
    expect(v?.status).toBe(true);
  });

  it("rejects unauthorized oracle", () => {
    contract.setOraclePrincipal("ST2ORACLE");
    contract.caller = "ST3FAKE";
    const proof = Buffer.alloc(32);
    const result = contract.submitVerification(1, 85, 70, proof, "oracle", 5, 1000, "Test");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_NOT_VERIFIED);
  });

  it("updates verification successfully", () => {
    const proof = Buffer.alloc(32);
    contract.submitVerification(1, 85, 70, proof, "quiz", 5, 1000, "Test");
    const result = contract.updateVerification(0, 90, 80);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const v = contract.getVerification(0);
    expect(v?.score).toBe(90);
    expect(v?.threshold).toBe(80);
    expect(v?.status).toBe(true);
    const update = contract.state.verificationUpdates.get(0);
    expect(update?.updateScore).toBe(90);
    expect(update?.updateThreshold).toBe(80);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update by non-user", () => {
    const proof = Buffer.alloc(32);
    contract.submitVerification(1, 85, 70, proof, "quiz", 5, 1000, "Test");
    contract.caller = "ST3FAKE";
    const result = contract.updateVerification(0, 90, 80);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets verification fee successfully", () => {
    const result = contract.setVerificationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.verificationFee).toBe(1000);
  });

  it("rejects fee change by non-admin", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setVerificationFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("returns correct verification count", () => {
    const proof = Buffer.alloc(32);
    contract.submitVerification(1, 85, 70, proof, "quiz", 5, 1000, "Test1");
    contract.submitVerification(2, 90, 80, proof, "quiz", 6, 2000, "Test2");
    const result = contract.getVerificationCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks verification status correctly", () => {
    const proof = Buffer.alloc(32);
    contract.submitVerification(1, 85, 70, proof, "quiz", 5, 1000, "Test");
    const result = contract.checkVerificationStatus("ST1TEST", 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkVerificationStatus("ST1TEST", 2);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects submission with max verifications exceeded", () => {
    contract.state.maxVerifications = 1;
    const proof = Buffer.alloc(32);
    contract.submitVerification(1, 85, 70, proof, "quiz", 5, 1000, "Test1");
    const result = contract.submitVerification(2, 90, 80, proof, "quiz", 6, 2000, "Test2");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_VERIFICATIONS_EXCEEDED);
  });

  it("rejects invalid expiry", () => {
    const proof = Buffer.alloc(32);
    const result = contract.submitVerification(1, 85, 70, proof, "quiz", 5, 0, "Test");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EXPIRY);
  });
});