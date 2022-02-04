import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Helpers, HelpersBase } from '../helpers/helpers';

import { AsignFamilyComponent } from '../asign-family/asign-family.component';
import { ApplicationSettings } from '../manage/ApplicationSettings';
import { Remult } from 'remult';
import { BusyService, DialogConfig } from '@remult/angular';
import { DialogService } from '../select-popup/dialog';

@Component({
  selector: 'app-helper-assignment',
  templateUrl: './helper-assignment.component.html',
  styleUrls: ['./helper-assignment.component.scss']
})
@DialogConfig({
  minWidth: '95%',
  height: '98%',
  panelClass: 'assign-volunteer-dialog'


})
export class HelperAssignmentComponent implements OnInit {
  public argsHelper: HelpersBase;
  constructor(
    private dialogRef: MatDialogRef<any>,
    public settings: ApplicationSettings,
    public remult: Remult,
    private dialog: DialogService,
    private busy: BusyService
  ) {
  }
  @ViewChild("assign", { static: true }) asign: AsignFamilyComponent;
  ngOnInit() {
    this.asign.specificToHelper(this.argsHelper);
  }

  close() {
    this.dialogRef.close();
  }
  async edit() {
    let h = await this.argsHelper.getHelper();
    await h.displayEditDialog(this.dialog)
  }
}