module.exports = api => {
  api.cache(true)
  return {
    assumptions: { setSpreadProperties: false },
    plugins: [
      [
        "@babel/plugin-transform-object-rest-spread",
        { loose: false, useBuiltIns: false },
      ],
    ],
    presets: ["babel-preset-expo"],
  }
}
