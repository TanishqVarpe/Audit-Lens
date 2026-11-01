/**
 * The SWC Registry (https://swcregistry.io). Used to verify SWC IDs the model claims,
 * to link each finding to its entry, and as a beginner explanation when the AI gave none.
 */
export interface SwcEntry {
  title: string;
  simple: string;
}

export const SWC: Record<string, SwcEntry> = {
  "SWC-100": { title: "Function Default Visibility", simple: "A function has no visibility keyword, so it may be callable by anyone. Always write public, external, internal or private on purpose." },
  "SWC-101": { title: "Integer Overflow and Underflow", simple: "A number went past its maximum or below zero and wrapped around, like a car odometer rolling over. Solidity 0.8+ stops this unless code uses unchecked." },
  "SWC-102": { title: "Outdated Compiler Version", simple: "An old compiler may have known bugs. Use a recent, fixed Solidity version." },
  "SWC-103": { title: "Floating Pragma", simple: "The ^ in the pragma lets the code compile with many versions. Pin one version so what you tested is what you deploy." },
  "SWC-104": { title: "Unchecked Call Return Value", simple: "A low-level call or send can fail quietly and return false. If the code doesn't check that, it carries on as if the payment worked." },
  "SWC-105": { title: "Unprotected Ether Withdrawal", simple: "Anyone can call a function that sends the contract's ETH out. It needs a check on who is calling." },
  "SWC-106": { title: "Unprotected SELFDESTRUCT Instruction", simple: "Anyone can trigger selfdestruct and wipe the contract, sending its ETH away." },
  "SWC-107": { title: "Reentrancy", simple: "The contract pays someone before updating its records. A malicious receiver can call back in during the payment and get paid again and again, like a cash machine that hands out money before reducing your balance." },
  "SWC-108": { title: "State Variable Default Visibility", simple: "A state variable has no visibility keyword. Mark it explicitly so its access is intentional." },
  "SWC-109": { title: "Uninitialized Storage Pointer", simple: "A local variable points at storage slot 0 by accident and can overwrite important data." },
  "SWC-110": { title: "Assert Violation", simple: "An assert failed. assert is for things that should never happen, so this points at a real bug." },
  "SWC-111": { title: "Use of Deprecated Solidity Functions", simple: "The code uses old functions that were removed or replaced. Use the modern equivalents." },
  "SWC-112": { title: "Delegatecall to Untrusted Callee", simple: "delegatecall runs someone else's code with this contract's storage and balance. If the target can be chosen by a user, they can take over the contract." },
  "SWC-113": { title: "DoS with Failed Call", simple: "One failing payment blocks everyone, because the whole transaction reverts. Let users withdraw separately instead." },
  "SWC-114": { title: "Transaction Order Dependence", simple: "Someone who sees your transaction waiting can send theirs first (front-running) and profit from the order." },
  "SWC-115": { title: "Authorization through tx.origin", simple: "tx.origin is whoever started the transaction, not who is calling right now. A malicious contract you interact with can act as you." },
  "SWC-116": { title: "Block values as a proxy for time", simple: "block.timestamp and block.number can be nudged slightly by validators. Don't rely on them for precise timing or fairness." },
  "SWC-117": { title: "Signature Malleability", simple: "The same signature can be rewritten into a second valid form. Don't use a raw signature as a unique ID." },
  "SWC-118": { title: "Incorrect Constructor Name", simple: "A function meant to be the constructor isn't one, so anyone can call it later." },
  "SWC-119": { title: "Shadowing State Variables", simple: "Two variables share a name, so the code may read or write the wrong one." },
  "SWC-120": { title: "Weak Sources of Randomness from Chain Attributes", simple: "Blockchain data is public and predictable, so it can't be used as a secret random number. Use an oracle like Chainlink VRF." },
  "SWC-121": { title: "Missing Protection against Signature Replay Attacks", simple: "A valid signature can be sent again to repeat the action. Include a nonce and the chain ID in what gets signed." },
  "SWC-122": { title: "Lack of Proper Signature Verification", simple: "The code trusts that a message is from someone without properly checking their signature." },
  "SWC-123": { title: "Requirement Violation", simple: "A require check can fail for valid input, or is too weak to stop bad input." },
  "SWC-124": { title: "Write to Arbitrary Storage Location", simple: "A user can choose where in storage to write, so they can overwrite anything, including the owner." },
  "SWC-125": { title: "Incorrect Inheritance Order", simple: "With multiple inheritance, the order decides which parent's function wins. The wrong order changes behaviour." },
  "SWC-126": { title: "Insufficient Gas Griefing", simple: "A relayer can send just enough gas for the outer call to succeed while the inner call fails." },
  "SWC-127": { title: "Arbitrary Jump with Function Type Variable", simple: "A function-pointer variable can be pointed at arbitrary code." },
  "SWC-128": { title: "DoS With Block Gas Limit", simple: "A loop over a list that keeps growing will eventually cost more gas than a block allows, and the function stops working forever." },
  "SWC-129": { title: "Typographical Error", simple: "A small typo such as =+ instead of += changes the meaning of the code." },
  "SWC-130": { title: "Right-To-Left-Override control character", simple: "Hidden Unicode characters make the code look different from what it actually does." },
  "SWC-131": { title: "Presence of unused variables", simple: "A variable is declared but never used. Remove it to keep the code clear and save gas." },
  "SWC-132": { title: "Unexpected Ether balance", simple: "The code assumes it knows the exact ETH balance, but ETH can be forced into a contract." },
  "SWC-133": { title: "Hash Collisions With Multiple Variable Length Arguments", simple: "abi.encodePacked with two dynamic values can make different inputs produce the same hash." },
  "SWC-134": { title: "Message call with hardcoded gas amount", simple: "Sending a fixed amount of gas (like transfer's 2300) can break when gas costs change." },
  "SWC-135": { title: "Code With No Effects", simple: "A line of code does nothing, which usually means it doesn't do what the author intended." },
  "SWC-136": { title: "Unencrypted Private Data On-Chain", simple: "Private variables are still readable by anyone looking at the chain. Never store secrets in a contract." },
};

/** Slither detector → SWC, for tool-only reports and as a fallback. */
const SLITHER_TO_SWC: Record<string, string> = {
  "reentrancy-eth": "SWC-107",
  "reentrancy-no-eth": "SWC-107",
  "reentrancy-benign": "SWC-107",
  "reentrancy-events": "SWC-107",
  "reentrancy-unlimited-gas": "SWC-107",
  "tx-origin": "SWC-115",
  "unchecked-send": "SWC-104",
  "unchecked-lowlevel": "SWC-104",
  "unchecked-transfer": "SWC-104",
  "controlled-delegatecall": "SWC-112",
  "delegatecall-loop": "SWC-112",
  "arbitrary-send-eth": "SWC-105",
  "suicidal": "SWC-106",
  "solc-version": "SWC-102",
  "pragma": "SWC-103",
  "weak-prng": "SWC-120",
  "timestamp": "SWC-116",
  "shadowing-state": "SWC-119",
  "shadowing-local": "SWC-119",
  "uninitialized-storage": "SWC-109",
  "controlled-array-length": "SWC-124",
  "calls-loop": "SWC-113",
  "costly-loop": "SWC-128",
  "unused-state": "SWC-131",
  "deprecated-standards": "SWC-111",
  "encode-packed-collision": "SWC-133",
  "rtlo": "SWC-130",
  "incorrect-equality": "SWC-132",
};

const TYPE_TO_SWC: [RegExp, string][] = [
  [/reentran/i, "SWC-107"],
  [/tx\.?origin/i, "SWC-115"],
  [/delegatecall/i, "SWC-112"],
  [/unchecked.*(return|send|call)|unchecked send/i, "SWC-104"],
  [/access control|unprotected|authori[sz]ation/i, "SWC-105"],
  [/overflow|underflow/i, "SWC-101"],
  [/randomness|prng/i, "SWC-120"],
  [/front.?run|transaction order/i, "SWC-114"],
  [/selfdestruct|suicid/i, "SWC-106"],
  [/signature replay/i, "SWC-121"],
];

export const swcUrl = (id: string) => `https://swcregistry.io/docs/${id}`;

/** Normalise "swc 107", "SWC-107", "107" → "SWC-107"; unknown IDs → undefined. */
export function normalizeSwc(v: unknown): string | undefined {
  const m = String(v ?? "").match(/(\d{3})/);
  const id = m ? `SWC-${m[1]}` : "";
  return SWC[id] ? id : undefined;
}

/** Best SWC for a finding: verified model claim, then Slither check, then type keywords. */
export function swcFor(claimed: unknown, check?: string, type?: string): string | undefined {
  const id = normalizeSwc(claimed);
  if (id) return id;
  if (check && SLITHER_TO_SWC[check]) return SLITHER_TO_SWC[check];
  const hit = TYPE_TO_SWC.find(([re]) => re.test(`${type ?? ""} ${check ?? ""}`));
  return hit?.[1];
}
