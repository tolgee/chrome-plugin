const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const CopyPlugin = require('copy-webpack-plugin');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const ChromeExtensionReloader = require('webpack-chrome-extension-reloader');

module.exports = env => {

    process.env.mode = env.mode;
    const isDevelopment = env.mode === "development";

    return {
        entry: {
            index: "./src/popup/index.tsx",
            background: "./src/background.ts",
            contentScript: "./src/contentScript.ts"

        },
        devtool: isDevelopment ? "inline-source-map" : 'source-map',
        output: {
            filename: !isDevelopment ? '[name].[chunkhash].js' : '[name].js',
            chunkFilename: !isDevelopment ? '[name].[chunkhash].js' : '[name].js',
            path: path.resolve(__dirname, 'dist'),
            publicPath: '/',
        },
        resolve: {
            extensions: [".webpack.js", ".web.js", ".ts", ".js", ".tsx"]
        },
        module: {
            rules: [{
                test: /\.tsx?$/,
                use: ["ts-loader"],
                exclude: [/node_modules/, /lib/],
            }, {
                test: /\.svg$/,
                use: [
                    {
                        loader: "babel-loader"
                    },
                    {
                        loader: "react-svg-loader",
                        options: {
                            jsx: true // true outputs JSX tags
                        }
                    }
                ]
            },
                {
                    test: /\.(woff(2)?|ttf|eot)(\?v=\d+\.\d+\.\d+)?$/,
                    use: [
                        {
                            loader: 'file-loader',
                            options: {
                                name: '[name].[ext]',
                                outputPath: 'fonts/'
                            }
                        }
                    ]
                },
                {
                    test: /favicon\.svg/,
                    loader: 'file-loader?name=[name].[ext]'
                }
            ]
        },
        optimization: {
            usedExports: true,
            splitChunks: {
                chunks: (ch) => ch.name !== "contentScript",
            },
        },
        mode: env.mode || 'production',
        plugins: [
            new CleanWebpackPlugin(),
            new ChromeExtensionReloader(),
            new HtmlWebpackPlugin({
                template: './src/popup/index.html',
                excludeChunks: ["background", "contentScript"]
            }),
            //new BundleAnalyzerPlugin()
            new CopyPlugin([
                    {from: 'assets/**', to: './'},
                    {from: 'manifest.json', to: './manifest.json'},
                ],
            )
        ],
    }
};
