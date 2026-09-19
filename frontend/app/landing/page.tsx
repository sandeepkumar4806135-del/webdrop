import { redirect } from "next/navigation";

/**
 * The marketing homepage moved to "/" - this route only exists so old
 * /landing links (bookmarks, shared URLs, indexed pages) don't 404.
 */
export default function LandingRedirect() {
  redirect("/");
}
