#!/usr/bin/env node
import 'source-map-support/register';
import * as ctx from '../contexts/context.json';
import { IContext } from '../contexts/IContext';
import { AppBuilderOlap } from './EttAppBuilderOlap';
import { AppBuilderEvent } from './EttAppBuilderEvent';
import { AppBuilder } from './EttAppBuilder';

const context:IContext = <IContext>ctx;
let appBuilder: AppBuilder;

if(context.BUCKET_OLAP) {
  appBuilder = new AppBuilderOlap(context);
}
else {
  appBuilder = new AppBuilderEvent(context);
}

appBuilder.build()


