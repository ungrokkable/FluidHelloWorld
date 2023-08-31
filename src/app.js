/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedMap } from "fluid-framework";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { PactMap } from "@fluid-experimental/pact-map";

export const diceValueKey = "dice-value-key";
// Load container and render the app

const client = new TinyliciousClient();
const containerSchema = {
	initialObjects: { diceMap: SharedMap },
};
const containerSchemaWPactMap = {
	initialObjects: { diceMap: SharedMap },
	dynamicObjectTypes: [PactMap],
};
const propertyDdsVersion = "1.0.0";

const root = document.getElementById("content");

const setupPactMeta = async (pactMeta) => {
	// Make sure we're really connected
	if (!pactMeta.isAttached() || !pactMeta.connected) {
		await new Promise((resolve) => {
			console.log("Waiting for pactMeta to finish connecting");
			pactMeta.onConnect = () => resolve();
		});
		console.log("pactMeta finished connecting");
	} else {
		console.log("pactMeta already connected");
	}

	// Get version and compare or set version
	const curPropDdsVer = pactMeta.get("propertyDdsVersion");
	if (curPropDdsVer) {
		const compversions = `Container software version ${curPropDdsVer} - application version ${propertyDdsVersion}`;
		console.log(compversions);
	} else {
		const compversions = `No container version - setting application version ${propertyDdsVersion}`;
		console.warn(compversions);
		pactMeta.set("propertyDdsVersion", propertyDdsVersion);
	}

	// Setup events
	pactMeta.on("pending", (key) => {
		const pendingValue = pactMeta.getPending(key);
		console.log("Pending change to PactMeta data", key, pendingValue);
	});
	pactMeta.on("accept", (key) => {
		const newValue = pactMeta.get(key);
		console.log("Accepted change to PactMeta data", key, newValue);
	});
};

const createNewDice = async () => {
	console.log("createNewDice");
	const { container } = await client.createContainer(containerSchema);
	container.initialObjects.diceMap.set(diceValueKey, 1);
	const id = await container.attach();
	renderDiceRoller(container.initialObjects.diceMap, root);
	return id;
};

const loadExistingDice = async (id) => {
	console.log("loadExistingDice");
	const { container } = await client.getContainer(id, containerSchemaWPactMap);

	const handleMapChange = async (key) => {
		const realKey = typeof key === "object" ? key.key : key;
		console.log(`handleMapChange ${realKey}`);
		if (realKey === "pactMeta") {
			console.log("pactMeta added to shared map");
			const pactMeta = await container.initialObjects.diceMap.get("pactMeta")?.get();
			setupPactMeta(pactMeta);
		}
	};
	container.initialObjects.diceMap.on("valueChanged", handleMapChange);

	const pactMeta = await container.initialObjects.diceMap.get("pactMeta")?.get();
	if (!pactMeta) {
		console.warn("Adding pactMeta to existing container");
		const newPactMeta = await container.create(PactMap);
		container.initialObjects.diceMap.set("pactMeta", newPactMeta.handle);
	} else {
		setupPactMeta(pactMeta);
	}

	renderDiceRoller(container.initialObjects.diceMap, root);
};

async function start() {
	if (location.hash) {
		await loadExistingDice(location.hash.substring(1));
	} else {
		const id = await createNewDice();
		location.hash = id;
	}
}

start().catch((error) => console.error(error));

// Define the view
const template = document.createElement("template");

template.innerHTML = `
  <style>
    .wrapper { text-align: center }
    .dice { font-size: 200px }
    .roll { font-size: 50px;}
  </style>
  <div class="wrapper">
    <div class="dice"></div>
    <button class="roll"> Roll </button>
  </div>
`;

const renderDiceRoller = (diceMap, elem) => {
	elem.appendChild(template.content.cloneNode(true));

	const rollButton = elem.querySelector(".roll");
	const dice = elem.querySelector(".dice");

	// Set the value at our dataKey with a random number between 1 and 6.
	rollButton.onclick = () => diceMap.set(diceValueKey, Math.floor(Math.random() * 6) + 1);

	// Get the current value of the shared data to update the view whenever it changes.
	const updateDice = (key) => {
		if (key !== diceValueKey) return;
		const diceValue = diceMap.get(diceValueKey);
		// Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
		dice.textContent = String.fromCodePoint(0x267f + diceValue);
		dice.style.color = `hsl(${diceValue * 60}, 70%, 30%)`;
	};
	updateDice(diceValueKey);

	// Use the changed event to trigger the rerender whenever the value changes.
	diceMap.on("valueChanged", updateDice);
	// Setting "fluidStarted" is just for our test automation
	window["fluidStarted"] = true;
};
