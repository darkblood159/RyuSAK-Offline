import electron from "electron";
import { SYS_SETTINGS } from "../../index";

const loadComponentIpcHandler = async () => Promise.all([
  SYS_SETTINGS,
  [], // Mock empty shader list
  [], // Mock empty save list
  [], // Mock empty mods title list
  "1.0.0", // Mock firmware version
  "1.0.0", // Mock application version
  electron.app.getVersion(),
  100, // Mock threshold value
  "1.0.0" // Mock shaders minimum version
]);

export default loadComponentIpcHandler;
