export function twMerge(...inputs) {
  return inputs.flat(Infinity).filter((x) => typeof x === "string" && x.length > 0).join(" ");
}
