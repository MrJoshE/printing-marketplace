# Printing Marketplace

## Overview

This is a project that is being used to learn event driven architecture. The goal is to build an end to 3D printing marketplace that allows users to list and sell their 3D Printing Designs.

### What and why event driven

Even Driven Architecture at a high level facilitates asynchronous processing based off of 'events' oppposed to performing all required processing at the time of initial request.

An example of this would be a user uploading a design might require further processing before it becomes available to other users via the listing service. We might want to do some validation on the files and the listing data such as making sure it is not corrupt, or providing end users with more data from the uploaded file such as a render of the design from the file instead of one uploaded by the user to ensure it is what the uploader says it is.

## Infrastructure

### User Management

#### Keycloak

Keycloak is an open source identity & access management tool / software that handles authentication over commonly used open standard mechanisms such as OpenID Connect & SAML.

The goal is to use keycloak to onboard new users, authenticate existing users & authorize their requests in the micro-services that are running as part of this project.

#### Setup

Either use the docker-compose.infrastructure.yml with a .env file or there needs to be the following available for the main application services to connect to:

1. Keycloak instance for auth
   a. There should a private client for the gatetway
   b. There should be a public client for the web ui
2. Postgres instance of persistence
   a. Database for the keycloak
   b. Database foe the application

### Marketplace

#### Purpose

The marketplace application the entry point for a consumer of this project.

#### Functionality

- Viewing uploaded & validated design listings (not the design files) (all users un-authenticated)
- User authentication
  - Registering payment information
  - Registering contact information
- Uploading designs
  - Description
  - Desgin file
  - Dimensions
  - Intended use
- Purchasing designs
  - Generate a signed temporary URL for the private file
  - Must be logged into download them from the URL

### Gateway
