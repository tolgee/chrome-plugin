import {singleton} from "tsyringe";
import {Properties} from "./Context";

@singleton()
export class ScreenShotMaker {
    readonly capture = (input) => {
        return new Promise((resolve) => {
            chrome.tabs.captureVisibleTab((data) => {
                this.store(input, data);
                resolve(data);
            });
        });
    };

    private readonly store = (input, data) => {
        chrome.storage.local.get([Properties.config.apiKey as string], (storage) => {
            const stored = storage[Properties.config.apiKey] || {};
            stored.screenshots = stored.screenshots || {};
            stored.screenshots[input] = data;
            chrome.storage.local.set({[Properties.config.apiKey as string]: stored});
        })
    };

    public readonly getScreenshots = () =>
        new Promise(resolve =>
            chrome.storage.local.get([Properties.config.apiKey as string], (storage) => {
                const data = storage[Properties.config.apiKey] || {};
                data.screenshots = data.screenshots || {};
                resolve(data.screenshots)
            })
        );
}