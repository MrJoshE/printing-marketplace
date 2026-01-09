

import type { ListingFile } from "@/lib/api/models";
import { Html, OrbitControls, Stage, useProgress } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import {
    AlertOctagon,
    FileIcon,
    Loader2,
    RefreshCw
} from "lucide-react";
import React, { Suspense, useEffect } from "react";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { Button } from "../ui/button";

// --- CONSTANTS ---
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB Cap for browser safety

class SceneErrorBoundary extends React.Component<
    { children: React.ReactNode }, 
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-full w-full flex-col items-center justify-center bg-muted/20 p-4 text-center">
                    <AlertOctagon className="mb-2 h-8 w-8 text-red-500" />
                    <p className="text-sm font-semibold text-foreground">Failed to render model</p>
                    <p className="text-xs text-muted-foreground max-w-[200px] break-words">
                        {this.state.error?.message || "WebGL Context Lost"}
                    </p>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4 gap-2"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        <RefreshCw className="h-3 w-3" /> Retry
                    </Button>
                </div>
            );
        }
        return this.props.children;
    }
}

// --- SUB-COMPONENT: The Model Loader ---
function STLModel({ url, fileSize }: { url: string; fileSize: number }) {
    // SECURITY: Prevent loading massive files that will crash the browser tab
    if (fileSize > MAX_FILE_SIZE_BYTES) {
        throw new Error(`File too large for live preview (${(fileSize/1024/1024).toFixed(0)}MB). Download to view.`);
    }

    // Load geometry
    const geometry = useLoader(STLLoader, url);

    useEffect(() => {
        return () => {
            geometry.dispose();
        };
    }, [geometry]);

    return (
        <mesh geometry={geometry} castShadow receiveShadow>
            <meshStandardMaterial 
                color="#f1f5f9" 
                roughness={0.5} 
                metalness={0.1} 
            />
        </mesh>
    );
}

// --- SUB-COMPONENT: Loading State ---
function Loader() {
    const { progress } = useProgress();
    return (
        <Html center>
            <div className="flex flex-col items-center gap-2 rounded-lg bg-background/80 p-4 shadow-sm backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs font-medium text-muted-foreground">
                    Loading {progress.toFixed(0)}%
                </span>
            </div>
        </Html>
    );
}

// --- MAIN COMPONENT ---
export function ModelRender({ file }: { file: ListingFile }) {
    // 1. Guard Clauses (Data Integrity)
    if (file.status !== "VALID" || !file.file_path) {
        // ... (Keep existing loading/error state)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center bg-muted/20 text-muted-foreground">
                <FileIcon className="h-10 w-10 opacity-20" />
                <span className="mt-2 text-xs font-medium uppercase tracking-wider">
                    {file.status === "PENDING" ? "Processing..." : "Preview Unavailable"}
                </span>
            </div>
        );
    }

    return (
        <div className="relative h-full w-full overflow-hidden rounded-md bg-black dark:bg-black">
            <SceneErrorBoundary>
                <Canvas 
                    className="absolute inset-0"
                    
                    shadows 
                    dpr={[1, 2]} 
                    camera={{ fov: 50 }}
                    frameloop="always" 
                    gl={{ 
                        powerPreference: "high-performance",
                        antialias: true,
                        preserveDrawingBuffer: true 
                    }}
                    onCreated={({ gl }) => {
                        gl.domElement.addEventListener('webglcontextlost', (event) => {
                            event.preventDefault();
                            console.error("WebGL Context Lost");
                        }, false);
                    }}
                >
                    <Suspense fallback={<Loader />}>
                        <Stage environment="city" intensity={0.5} adjustCamera>
                            <STLModel 
                                url={file.file_path} 
                                fileSize={file.file_size} 
                            />
                        </Stage>
                    </Suspense>

                    <OrbitControls 
                        makeDefault 
                        autoRotate 
                        autoRotateSpeed={0.5} 
                        enablePan={false} 
                        minPolarAngle={0} 
                        maxPolarAngle={Math.PI / 1.5} 
                    />
                </Canvas>
            </SceneErrorBoundary>

            {/* Overlay: Info Badge */}
            <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1 pointer-events-none z-10">
                 <div className="rounded bg-black/50 px-2 py-1 text-[10px] text-white backdrop-blur">
                    Live Preview
                </div>
                {file.file_size > 10 * 1024 * 1024 && (
                     <div className="rounded bg-yellow-500/50 px-2 py-1 text-[10px] text-white backdrop-blur">
                        Large File ({(file.file_size / 1024 / 1024).toFixed(0)}MB)
                    </div>
                )}
            </div>
        </div>
    );
}