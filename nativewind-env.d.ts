/// <reference types="nativewind/types" />

declare module "*.css" {
    const css: Record<string, string>;
    export default css;
}
