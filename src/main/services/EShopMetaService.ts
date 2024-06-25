import fs from "fs-extra";
import path from "path";
import { Mutex } from "async-mutex";
import { app } from "electron";
import { EShopTitles, EShopTitleMeta } from "../../types";
import HttpService from "../services/HttpService";

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

        let titleMeta = eShopTitles[titleId] || { id: titleId, name: titleId, iconUrl: "" };
        titleMeta.name ??= titleId;
        titleMeta.iconUrl ??= "";

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
