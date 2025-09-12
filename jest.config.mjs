export default {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  testEnvironment: "node",
  roots: ["<rootDir>/backend", "<rootDir>/src"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^../server.js$": "<rootDir>/backend/server.ts"
  },
  transform: {
    "^.+\.(ts|tsx|js|jsx)$": ["ts-jest", { useESM: true }]
  }
};
