import { PROJECTS } from "@/lib/projects";
import HomeClient from "./home-client";

export default function HomePage() {
  return <HomeClient projects={PROJECTS} />;
}
