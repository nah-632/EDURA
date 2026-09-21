export default function clsx(...inputs) {
  return inputs.flat(Infinity).filter((x) => typeof x === "string" && x.length > 0).join(" ");
}
