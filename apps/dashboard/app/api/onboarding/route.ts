import { createOnboardingHandlers } from "../../../lib/bff/onboarding";
import { withBffHandler } from "../../../lib/bff/serverDependencies";

export const GET = withBffHandler((dependencies) => createOnboardingHandlers(dependencies).GET);
export const PUT = withBffHandler((dependencies) => createOnboardingHandlers(dependencies).PUT);
export const POST = withBffHandler((dependencies) => createOnboardingHandlers(dependencies).POST);
