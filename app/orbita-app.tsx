"use client";

import { AppHeader, Footer } from "@/app/orbita-views";
import { OrbitaViewRouter } from "@/app/orbita-view-router";
import { LandingPage } from "@/app/landing/landing-page";
import { useOrbitaController, type OrbitaControllerOptions } from "@/hooks/use-orbita-controller";

export function OrbitaApp(options: OrbitaControllerOptions) {
  const controller = useOrbitaController(options);

  if (controller.view === "home") {
    return (
      <LandingPage
        onNavigate={controller.go}
        onDemo={controller.openDemo}
        requestError={controller.requestError}
        onDismissError={controller.dismissRequestError}
      />
    );
  }

  const immersive = controller.view === "assessment";

  return (
    <div className={immersive ? "orbita-app immersive" : "orbita-app"}>
      {!immersive ? <AppHeader onNavigate={controller.go} view={controller.view} /> : null}
      {controller.requestError ? <div className="global-error" role="alert">{controller.requestError}<button onClick={controller.dismissRequestError} type="button" aria-label="Закрыть">×</button></div> : null}
      {/* key по view перезапускает лёгкую mount-анимацию перехода (см. .ts-view-enter) */}
      <div key={controller.view} className="ts-view-enter">
        <OrbitaViewRouter controller={controller} />
      </div>
      {!immersive ? <Footer onNavigate={controller.go} /> : null}
    </div>
  );
}
