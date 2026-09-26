import { describe, expect, test, vi } from "vitest";
import { watchForNewBuild } from "./use-app-update";

function fakeContainer(controller: object | null) {
  const target = new EventTarget() as EventTarget & { controller: object | null };
  target.controller = controller;
  return target as unknown as ServiceWorkerContainer;
}

describe("watchForNewBuild", () => {
  test("a new worker claiming an already-controlled page = new build", () => {
    const onNewBuild = vi.fn();
    const container = fakeContainer({});
    watchForNewBuild({ container, onNewBuild });

    container.dispatchEvent(new Event("controllerchange"));
    expect(onNewBuild).toHaveBeenCalledTimes(1);
  });

  test("first-ever install (no controller at load) does not prompt, later updates do", () => {
    const onNewBuild = vi.fn();
    const container = fakeContainer(null);
    watchForNewBuild({ container, onNewBuild });

    container.dispatchEvent(new Event("controllerchange")); // first install claims the page
    expect(onNewBuild).not.toHaveBeenCalled();
    container.dispatchEvent(new Event("controllerchange")); // a real update afterwards
    expect(onNewBuild).toHaveBeenCalledTimes(1);
  });

  test("the server's build id changing (Nuxt app manifest) = new build", () => {
    const onNewBuild = vi.fn();
    let fireBuildChanged: () => void = () => {};
    watchForNewBuild({ container: null, onBuildChanged: cb => (fireBuildChanged = cb), onNewBuild });

    fireBuildChanged();
    expect(onNewBuild).toHaveBeenCalledTimes(1);
  });

  test("cleanup stops listening", () => {
    const onNewBuild = vi.fn();
    const container = fakeContainer({});
    const stop = watchForNewBuild({ container, onNewBuild });
    stop();
    container.dispatchEvent(new Event("controllerchange"));
    expect(onNewBuild).not.toHaveBeenCalled();
  });
});
