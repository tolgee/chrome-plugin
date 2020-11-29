import 'reflect-metadata';
import 'regenerator-runtime/runtime';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {App} from "./App";
import {ContextProvider} from "./Context";

ReactDOM.render(
    <div>
        <ContextProvider>
            <App/>
        </ContextProvider>
    </div>,
    document.getElementById('root')
);