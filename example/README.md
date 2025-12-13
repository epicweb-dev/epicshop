<div>
  <h1 align="center"><a href="https://www.epicweb.dev/workshops">Epic Workshop App Tutorial 👨‍🏫</a></h1>
  <strong>
    Maximize your learning experience by learning how to use the Epic Workshop App
  </strong>
  <p>
    The Epic Workshop App is a powerful tool for learning and it takes some time to get used to. In this tutorial, we'll walk through the features of the app to make sure you're set up for success.
  </p>
</div>

<hr />

<div align="center">
  <a
    alt="Epic Web logo with the words Deployed Version"
    href="https://tutorial.epicweb.dev/"
  >
    <img
      width="300px"
      src="https://github-production-user-asset-6210df.s3.amazonaws.com/1500684/254000390-447a3559-e7b9-4918-947a-1b326d239771.png"
    />
  </a>
</div>

<hr />

<!-- prettier-ignore-start -->
[![Build Status][build-badge]][build]
[![GPL 3.0 License][license-badge]][license]
[![Code of Conduct][coc-badge]][coc]
<!-- prettier-ignore-end -->

## Prerequisites

Each workshop will have its own prerequisites you'll need to meet.

- Understanding of how to use the command line to run basic commands.

## Pre-workshop Resources

Here are some resources you can read before taking the workshop to get you up to
speed on some of the tools and concepts we'll be covering:

- None for this tutorial, but each workshop will have its own pre-workshop
  resources you'll want to read/watch/listen to.

## System Requirements

- [git][git] v2.18 or greater
- [NodeJS][node] v18 or greater
- [npm][npm] v8 or greater

All of these must be available in your `PATH`. To verify things are set up
properly, you can run this:

```shell
git --version
node --version
npm --version
```

If you have trouble with any of these, learn more about the PATH environment
variable and how to fix it here for [windows][win-path] or
[mac/linux][mac-path].

## Setup

Use the Epic Workshop CLI to get this setup:

```sh nonumber
npx --yes epicshop@latest add epicshop-tutorial
```

If you experience errors here, please open [an issue][issue] with as many
details as you can offer.

## The Workshop App

This workshop repository is intended to guide you through using the Epic
Workshop App. Once you have this repository cloned and setup as described above,
start the app in the terminal by running this command in the directory where you
cloned the repository:

```sh
npm run start
```

The URL for the app will be displayed and you can open it in the browser. From
there, follow the instructions in the app to complete the tutorial.

<!-- prettier-ignore-start -->
[npm]: https://www.npmjs.com/
[node]: https://nodejs.org
[git]: https://git-scm.com/
[build-badge]: https://img.shields.io/github/actions/workflow/status/epicweb-dev/epicshop-tutorial/validate.yml?branch=main&logo=github&style=flat-square
[build]: https://github.com/epicweb-dev/epicshop-tutorial/actions?query=workflow%3Avalidate
[license-badge]: https://img.shields.io/badge/license-GPL%203.0%20License-blue.svg?style=flat-square
[license]: https://github.com/epicweb-dev/epicshop-tutorial/blob/main/LICENSE
[coc-badge]: https://img.shields.io/badge/code%20of-conduct-ff69b4.svg?style=flat-square
[coc]: https://kentcdodds.com/conduct
[win-path]: https://www.howtogeek.com/118594/how-to-edit-your-system-path-for-easy-command-line-access/
[mac-path]: http://stackoverflow.com/a/24322978/971592
[issue]: https://github.com/epicweb-dev/epicshop-tutorial/issues/new
<!-- prettier-ignore-end -->
