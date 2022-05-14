// JupyterLab extension parts
import {
	JupyterFrontEnd,
	JupyterFrontEndPlugin
} from '@jupyterlab/application';

// Allow for settings to be loaded and saved
import { ISettingRegistry } from '@jupyterlab/settingregistry';

// Toolbar button class
import { ToolbarButton } from '@jupyterlab/apputils';

// Register with the Document registry to allow creation of widgets
// https://jupyterlab.readthedocs.io/en/stable/extension/documents.html#document-registry
import { DocumentRegistry } from '@jupyterlab/docregistry';

// Notebook manipulation
import {
	NotebookPanel,
	INotebookModel,
	INotebookTools,
} from '@jupyterlab/notebook';

// Allows widgets to be destroyed
import { IDisposable, DisposableDelegate } from '@lumino/disposable';

// For type annotations
// import { Cell } from '@jupyterlab/cells';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { TextMarker, Doc } from 'codemirror';

// For throttling
import _ from 'lodash';

interface GrammarResponse{
	offset: number;
	errorLength: number;
	message: string;
}

// Global enable for the extension
// var grammarChecker: GrammarButton;
var enabled: boolean = true;
var REFRESH_MS: number = 500;
var CALLBACK_MS: number = 300;
// Tracking cells to their text markers
var errorMarks: Map<Doc, TextMarker[]> = new Map();

function clearErrorMarks(doc: Doc) {
	// Wipe out all the old errors for the cell
	errorMarks.get(doc)?.forEach((mark: TextMarker) => {
		// console.log('clear!');
		mark.clear();
	});
}

function clearAllErrorMarksAndCallbacks() {
	// Wipe out all errors for all cells and the callback
	errorMarks.forEach((marks: TextMarker[], doc: Doc) => {
		marks.forEach((mark: TextMarker) => {
			// console.log('clear!');
			mark.clear();
		})
		doc.on('change', () => { });
	});
}

// Create a POST request on the text inside the markdown cell
function checkGrammar(doc: Doc) {
	if (!enabled) {
		console.log("Grammar checker is disabled.");
		return;
	}

	// Get editor and clear cells associated with the editor
	// var editor = cell.editor as CodeMirrorEditor;
	clearErrorMarks(doc);

	// Get the text from the Doc(ument?)
	var text = doc.getValue();

	fetch('http://localhost:5050/process', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
		body: JSON.stringify({ markdown: text })
	}).then((reply: Response) => {
		reply.json().then((data: GrammarResponse[]) => {
			data.forEach((error: GrammarResponse) => {
				// console.log(error);
				
				// Find where the error is
				var start = doc.posFromIndex(error.offset); // get objs with `line` and `ch` (column) info that markText needs
				var end = doc.posFromIndex(error.offset + error.errorLength);
				
				// Determine the class (for styling) to add to the error message
				var errorType = error.message.search('spelling') == -1 ? 'grammar-error' : 'spelling-error';
				// Apply the error style to the text
				errorMarks.get(doc)?.push(doc.markText(start, end, {
					attributes: { 'data-text': '(' + error.message + ')' },
					className: 'error-tooltip ' + errorType
				}));
			})
		})
	});
}

// grammar button functionality
class GrammarButton extends ToolbarButton {
	get onClick() {
		return () => {
			enabled = !enabled;
			console.log(`Grammar checker is now ${enabled ? "enabled" : "disabled"}`);
			// If turning off, clear all error marks and reset map
			if (!enabled) {
				clearAllErrorMarksAndCallbacks();
				errorMarks = new Map();
			}
		}
	}
}

// Factory which appends a button to the toolbar
export class GrammarExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {
	
	createNew(
		panel: NotebookPanel,
		context: DocumentRegistry.IContext<INotebookModel>
	): IDisposable {

		// Actual button which will get added
		const bToggle = new GrammarButton({
			className: 'grammar-check-button grammar-check-enabled',
			label: 'Grammar',
			icon: 'fa-times',
			pressedIcon: 'fa-check',
			tooltip: 'Toggles the grammar checker'
		});

		panel.toolbar.insertItem(10, 'toggleGrammar', bToggle);
		return new DisposableDelegate(() => {
			bToggle.dispose();
		});
	}
}


/**
 * Initialization data for the grammar_checker extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
	id: 'grammar_checker:plugin',
	autoStart: true,
	requires: [INotebookTools],
	optional: [ISettingRegistry],
	activate: (app: JupyterFrontEnd, notebook: INotebookTools, settingRegistry: ISettingRegistry | null) => {
		console.log('JupyterLab extension grammar_checker is activated!');

		// Settings boilerplate in case I want it
		if (settingRegistry) {
			settingRegistry
				.load(plugin.id)
				.then(settings => {
					// fix not sure if working - development install issue?
					console.log('grammar_checker settings loaded:', settings.composite);
					if (settings.composite['refresh_ms'] !== undefined) {
						REFRESH_MS = settings.composite['refresh_ms'] as number;
					}
					if (settings.composite['callback_refresh_ms'] !== undefined) {
						CALLBACK_MS = settings.composite['callback_refresh_ms'] as number;
					}
				})
				.catch(reason => {
					console.error('Failed to load settings for grammar_checker.', reason);
				});
		}

		// setTimeout cannot take args, so checkCells cannot have any arguments - use closure to access panel
		function checkActiveCell() {
			// For tracking how many cells are registered in the system
			// console.log(`errorMarks.size=${errorMarks.size}`);

			// Check only the active cell. Couldn't find a way to get all Cells in the notebook
			var cell /* Cell */ = notebook.activeCell;
			
			// If no active cell or non-markdown, reschedule and return
			if (!cell || cell.model.type !== 'markdown') {
				console.log(`Skipping active cell (type ${cell?.model.type}).`);
				setTimeout(checkActiveCell, REFRESH_MS);
				return;
			}
			
			// Get the Doc managing the cell -> Cannot use editor b/c CodeMirror's callback provides the Doc
			// Need to cast to get full access to the codemirror methods
			// https://stackoverflow.com/questions/67626233/how-can-i-get-a-reference-to-a-codemirror-instance-in-jupyterlab
			var doc = (cell.editor as CodeMirrorEditor).doc;
			if (enabled && !errorMarks.has(doc)) {
				console.log("Adding active cell.");
				errorMarks.set(doc, []); // Add entry for cell to track errors and only update on edits
				
				// Check grammar for the current cell
				// console.log("Checking active cell.");
				checkGrammar(doc);
				
				// Attach on-change handler callback so we only recheck the grammar on modifications. 
				// Throttled by lodash to prevent excessive calls to the backend server
				doc.on("change", _.throttle(
					moddoc => { checkGrammar(moddoc); }, CALLBACK_MS, // moddoc is the Doc when a change occurs
					{ leading: false, trailing: true }
				));
			}

			// Set timeout
			setTimeout(checkActiveCell, REFRESH_MS);
		}

		// Start process of checking cells
		checkActiveCell();

		// Add button to the toolbar
		app.docRegistry.addWidgetExtension('Notebook', new GrammarExtension());
	}
};

export default plugin;
