// Stub for the static preview harness: the real hooks need a Next router.
export function usePathname() {
  return "/ar/admin";
}
export function useRouter() {
  return { refresh() {}, replace() {}, push() {}, prefetch() {} };
}
export function useSearchParams() {
  return new URLSearchParams();
}
export function useParams() {
  return {};
}
