export type BoundsVec3 = [number, number, number];

export interface AnimationBoundsData {
  animation: string;
  sampleCount: number;
  algorithmVersion: string;
  box: {
    min: BoundsVec3;
    max: BoundsVec3;
  };
  center: BoundsVec3;
  size: BoundsVec3;
}

export interface ModelBoundsMetadata {
  model: string;
  generatedAt: string;
  sourceHash: string;
  animations: Record<string, AnimationBoundsData>;
}

export interface BoundsManifest {
  [name: string]: string;
}

const DEFAULT_BOUNDS_MANIFEST: BoundsManifest = {
  idle: new URL("../assets/bounds/Idle.bounds.json", import.meta.url).href,
};

export async function loadBoundsMetadata(
  manifest?: Partial<BoundsManifest>,
): Promise<Map<string, ModelBoundsMetadata>> {
  const merged = { ...DEFAULT_BOUNDS_MANIFEST, ...manifest };
  const entries = Object.entries(merged).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  const loaded = new Map<string, ModelBoundsMetadata>();

  const results = await Promise.allSettled(
    entries.map(async ([name, url]) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`failed to load bounds metadata: ${response.status}`);
      }

      const metadata = (await response.json()) as ModelBoundsMetadata;
      return { name, metadata };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      loaded.set(result.value.name, result.value.metadata);
    } else {
      console.warn(`[3d] failed to load bounds metadata:`, result.reason);
    }
  }

  return loaded;
}

export function getAnimationBounds(
  metadata: ModelBoundsMetadata | undefined,
  animationName: string,
): AnimationBoundsData | null {
  if (!metadata) return null;
  return metadata.animations[animationName] ?? null;
}
