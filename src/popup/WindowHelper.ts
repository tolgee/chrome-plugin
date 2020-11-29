import {singleton} from "tsyringe";

@singleton()
export class WindowHelper {
    readonly getWindow = () => {
        return new Promise(resolve => {
            chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
                chrome.windows.get(tabs[0].windowId, (w) => {
                });
            });
        })
    };
}