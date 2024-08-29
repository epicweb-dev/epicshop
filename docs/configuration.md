# Configuration

The Epic Workshop app can be configured using the `epicshop` field in the
`package.json` file. This document outlines all available configuration options.

## Workshop Configuration

These options should be set in the root `package.json` of your workshop.

| Option                                 | Type      | Description                              | Default                                                                 |
| -------------------------------------- | --------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `title`                                | `string`  | The title of your workshop               | Required                                                                |
| `subtitle`                             | `string`  | A subtitle for your workshop             | Optional                                                                |
| `instructor`                           | `object`  | Information about the instructor         | Optional                                                                |
| `instructor.name`                      | `string`  | Name of the instructor                   | Optional                                                                |
| `instructor.avatar`                    | `string`  | Path to the instructor's avatar image    | Optional                                                                |
| `instructor.𝕏` or `instructor.xHandle` | `string`  | Instructor's X (formerly Twitter) handle | Optional                                                                |
| `epicWorkshopHost`                     | `string`  | Host for the Epic Workshop               | `"www.epicweb.dev"`                                                     |
| `epicWorkshopSlug`                     | `string`  | Slug for the Epic Workshop               | Optional                                                                |
| `onboardingVideo`                      | `string`  | URL to the onboarding video              | `"https://www.epicweb.dev/tips/get-started-with-the-epic-workshop-app"` |
| `githubRepo`                           | `string`  | URL to the GitHub repository             | Required if `githubRoot` is not provided                                |
| `githubRoot`                           | `string`  | Root URL for GitHub file links           | Required if `githubRepo` is not provided                                |
| `stackBlitzConfig`                     | `object`  | Configuration for StackBlitz             | Optional                                                                |
| `forms.workshop`                       | `string`  | URL template for workshop feedback form  | Has a default value                                                     |
| `forms.exercise`                       | `string`  | URL template for exercise feedback form  | Has a default value                                                     |
| `testTab.enabled`                      | `boolean` | Whether to enable the test tab           | `true`                                                                  |
| `scripts.postupdate`                   | `string`  | Script to run after workshop update      | Optional                                                                |
| `initialRoute`                         | `string`  | Initial route for the app                | `"/"`                                                                   |

## StackBlitz Configuration

The `stackBlitzConfig` object can have the following properties:

| Option        | Type                                  | Description                             |
| ------------- | ------------------------------------- | --------------------------------------- |
| `title`       | `string`                              | Title for the StackBlitz project        |
| `startScript` | `string`                              | Script to run when starting the project |
| `view`        | `"editor"` \| `"preview"` \| `"both"` | Initial view in StackBlitz              |
| `file`        | `string`                              | Initial file to open in StackBlitz      |

## App-specific Configuration

These options can be set in the `package.json` of individual exercises to
override the global settings.

| Option             | Type               | Description                                 |
| ------------------ | ------------------ | ------------------------------------------- |
| `stackBlitzConfig` | `object` \| `null` | Override or disable StackBlitz for this app |
| `testTab.enabled`  | `boolean`          | Enable or disable the test tab for this app |
| `initialRoute`     | `string`           | Set a custom initial route for this app     |

## Example Configuration

Here's an example of some configuration in the root `package.json`:

```
{
  "epicshop": {
    "title": "Advanced React Patterns",
    "subtitle": "Master complex React patterns",
    "instructor": {
      "name": "Kent C. Dodds",
      "avatar": "/images/instructor.png",
      "𝕏": "kentcdodds"
    },
    "epicWorkshopSlug": "advanced-react-patterns",
    "githubRepo": "https://github.com/epicweb-dev/advanced-react-patterns",
    "stackBlitzConfig": {
      "view": "editor",
      "file": "src/App.tsx"
    },
    "forms": {
      "workshop": "https://docs.google.com/forms/d/e/1FAIpQLSdRmj9p8-5zyoqRzxp3UpqSbC3aFkweXvvJIKes0a5s894gzg/viewform?hl=en&embedded=true&entry.2123647600={workshopTitle}",
      "exercise": "https://docs.google.com/forms/d/e/1FAIpQLSf3o9xyjQepTlOTH5Z7ZwkeSTdXh6YWI_RGc9KiyD3oUN0p6w/viewform?hl=en&embedded=true&entry.1836176234={workshopTitle}&entry.428900931={exerciseTitle}"
    },
    "testTab": {
      "enabled": true
    },
    "scripts": {
      "postupdate": "npm run build"
    },
    "initialRoute": "/welcome"
  }
}
```
