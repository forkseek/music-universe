export type SceneBackdropName = "intro" | "sources" | "import" | "demo" | "library" | "qq" | "world" | "journey";

const sceneFrames: Record<SceneBackdropName, string> = {
  intro: "scene-hall.webp",
  sources: "scene-awaken.webp",
  import: "scene-awaken.webp",
  demo: "scene-run.webp",
  library: "scene-hall.webp",
  qq: "scene-awaken.webp",
  world: "scene-awaken.webp",
  journey: "scene-light.webp",
};

export function SceneBackdrop({ scene }: { scene: SceneBackdropName }) {
  return <div key={scene} className={`mw-scene-backdrop mw-backdrop-${scene}`} style={{ backgroundImage: `url(/media/${sceneFrames[scene]})` }} aria-hidden="true" />;
}
