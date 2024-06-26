import fs from "fs-extra";
import path from "path";
import { Mutex } from "async-mutex";
import { app } from "electron";
import { EShopTitles, EShopTitleMeta } from "../../types";
import HttpService from "../services/HttpService";
import axios from "axios"; // Import axios

// Function to dynamically search for Switch_Meta.json or fallback to Custom_Meta.json
const findSwitchDBPath = async (): Promise<string | null> => {
    const appPath = app.getAppPath();
    const switchPaths = [
        path.join(appPath, "src", "assets", "Switch_Meta.json"),
        path.join(path.dirname(appPath), "src", "assets", "Switch_Meta.json"),
        path.join(path.dirname(path.dirname(appPath)), "src", "assets", "Switch_Meta.json")
    ];

    const customPath = path.join(appPath, "src", "assets", "Custom_Meta.json");

    for (const switchPath of switchPaths) {
        if (await fs.pathExists(switchPath)) {
            return switchPath;
        }
    }

    if (await fs.pathExists(customPath)) {
        return customPath;
    }

    return null;
};

// Function to get the local icon path if it exists
const getLocalIconPath = (iconFileName: string): string | null => {
    const appPath = app.getAppPath();
    const iconPath = path.join(appPath, "src", "assets", "icons", iconFileName);

    if (fs.existsSync(iconPath)) {
        return iconPath;
    }

    return null;
};

// Function to download and save the image locally
const downloadImage = async (url: string, filePath: string): Promise<boolean> => {
    try {
        console.log(`Attempting to download image from URL: ${url}`);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        await new Promise((resolve, reject) => {
            response.data.pipe(fs.createWriteStream(filePath))
                .on('finish', () => {
                    console.log(`Image downloaded and saved to: ${filePath}`);
                    resolve(true);
                })
                .on('error', (error) => {
                    console.error(`Error saving image to file: ${filePath}`, error);
                    resolve(false); // Resolve with false on error
                });
        });

        return true;
    } catch (error) {
        console.error(`Error downloading image from ${url}:`, error);
        return false;
    }
};

class EShopMetaService {
    private eShopTitles: EShopTitles;
    private mutex = new Mutex();
    private switchDBPath: string | null = null;

    constructor() {
        this.eShopTitles = {};
        this.initialize();
    }

    private async initialize() {
        this.switchDBPath = await findSwitchDBPath();
        if (this.switchDBPath) {
            this.loadEShopData();
        } else {
            console.error("Neither Switch_Meta.json nor Custom_Meta.json could be found.");
        }
    }

    private async loadEShopData(): Promise<void> {
        if (!this.switchDBPath) {
            return;
        }

        try {
            this.eShopTitles = await fs.readJson(this.switchDBPath);
        } catch (error) {
            console.error(`Error loading meta data file: ${error}`);
        }
    }

    private async getEShopTitles(): Promise<EShopTitles> {
        if (this.eShopTitles) {
            return this.eShopTitles;
        }

        const release = await this.mutex.acquire();
        try {
            if (!this.eShopTitles) {
                await this.loadEShopData();
            }

            return this.eShopTitles;
        } finally {
            release();
        }
    }

    async getEShopMeta(titleId: string): Promise<EShopTitleMeta> {
        const eShopTitles = await this.getEShopTitles();
        titleId = titleId.toUpperCase();

        let titleMeta = eShopTitles[titleId] || { id: titleId, name: titleId, iconUrl: null }; // Initialize iconUrl as null
        titleMeta.name ??= titleId;

        // Check if iconUrl is not null and download the image if local file does not exist or if the online link fails
        if (titleMeta.iconUrl) {
            console.log(`Using online icon URL for ${titleId}: ${titleMeta.iconUrl}`);
            const localIconPath = getLocalIconPath(`${titleId}.png`);
            if (!localIconPath) {
                if (!(await downloadImage(titleMeta.iconUrl, path.join(app.getAppPath(), "src", "assets", "icons", `${titleId}.png`)))) {
                    console.log(`Falling back to local icon for ${titleId}`);
                    titleMeta.iconUrl = null; // Reset iconUrl to null if download fails
                }
            }
        }

        // If iconUrl is null, try to use local icon if available
        if (!titleMeta.iconUrl) {
            const localIconPath = getLocalIconPath(`${titleId}.png`);
            if (localIconPath) {
                titleMeta.iconUrl = `file://${localIconPath}`;
                console.log(`Local icon found: ${localIconPath}`);
            } else {
                console.log(`No icon found for ${titleId}`);
            }
        }

        return titleMeta;
    }

    async updateEShopData(): Promise<boolean> {
        if (!this.switchDBPath) {
            console.error("Meta data file path is not set.");
            return false;
        }

        try {
            const eshopDataJson: string = await HttpService.downloadEshopData();

            await fs.writeFile(this.switchDBPath, eshopDataJson, "utf-8");
            this.eShopTitles = JSON.parse(eshopDataJson);

            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}

export default new EShopMetaService();
